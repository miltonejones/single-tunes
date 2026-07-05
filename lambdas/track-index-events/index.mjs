/**
 * track-index-events Lambda
 *
 * POST /track-events
 * Body: { type: 'track.created', track: { id, createdAt, updatedAt }, occurredAt? }
 *    or { events: [...] } for batched backfills.
 *
 * Accepts stable track lifecycle events and enqueues provider-agnostic
 * track-index jobs onto a FIFO queue. The worker owns fetching catalog data and
 * talking to the actual index adapter.
 *
 * Runtime: Node.js 20.x (AWS SDK v3 in the runtime)
 */

import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({});

const TRACK_CREATED_EVENT_TYPE = 'track.created';
const TRACK_INDEX_JOB_TYPE = 'track.index';
const TRACK_INDEX_SCHEMA_VERSION = 1;
const QUEUE_URL = process.env.TRACK_INDEX_QUEUE_URL;
const BATCH_SIZE = 10;

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return resp(204, '');

  let body;
  try {
    body = parseBody(event);
  } catch {
    return resp(400, JSON.stringify({ error: 'invalid body' }));
  }

  const events = normalizeIncomingEvents(body);
  if (!events.length) {
    return resp(400, JSON.stringify({ error: 'track.created event payload required' }));
  }

  const jobs = [];
  for (const item of events) {
    try {
      jobs.push(buildTrackIndexJob(item, new Date().toISOString()));
    } catch (error) {
      return resp(400, JSON.stringify({ error: error.message }));
    }
  }

  const failed = [];
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const chunk = jobs.slice(i, i + BATCH_SIZE);
    const result = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: chunk.map((job, index) => ({
          Id: `${i + index}`,
          MessageBody: JSON.stringify(job),
          MessageGroupId: job.trackId,
          MessageDeduplicationId: job.idempotencyKey,
        })),
      }),
    );
    failed.push(...(result.Failed ?? []));
  }

  const accepted = jobs.length - failed.length;
  console.log(
    JSON.stringify({
      event: 'track_index_jobs_enqueued',
      accepted,
      failed: failed.length,
    }),
  );

  return resp(
    failed.length ? 207 : 202,
    JSON.stringify({
      accepted,
      failed: failed.length,
      jobs: jobs.map(({ trackId, idempotencyKey, updatedAt }) => ({
        trackId,
        idempotencyKey,
        updatedAt,
      })),
    }),
  );
};

function normalizeIncomingEvents(body) {
  if (Array.isArray(body?.events)) return body.events.map(normalizeTrackCreatedEvent);
  if (body?.type === TRACK_CREATED_EVENT_TYPE || body?.track?.id || body?.trackId) {
    return [normalizeTrackCreatedEvent(body)];
  }
  return [];
}

function normalizeTrackCreatedEvent(body) {
  if (body?.type && body.type !== TRACK_CREATED_EVENT_TYPE) {
    throw new Error(`unsupported event type: ${body.type}`);
  }

  const trackId = body?.track?.id ?? body?.trackId;
  const createdAt = body?.track?.createdAt ?? body?.createdAt;
  const updatedAt = body?.track?.updatedAt ?? body?.updatedAt;
  const occurredAt = body?.occurredAt ?? updatedAt;

  if (!trackId || !createdAt || !updatedAt) {
    throw new Error('track.created payload requires track.id, createdAt, and updatedAt');
  }

  return {
    type: TRACK_CREATED_EVENT_TYPE,
    version: TRACK_INDEX_SCHEMA_VERSION,
    occurredAt,
    source: 'single-tunes',
    track: {
      id: String(trackId),
      createdAt,
      updatedAt,
    },
  };
}

function buildTrackIndexJob(event, enqueuedAt) {
  return {
    jobType: TRACK_INDEX_JOB_TYPE,
    version: TRACK_INDEX_SCHEMA_VERSION,
    enqueuedAt,
    trackId: event.track.id,
    createdAt: event.track.createdAt,
    updatedAt: event.track.updatedAt,
    idempotencyKey: buildTrackIndexIdempotencyKey(event.track.id, event.track.updatedAt),
  };
}

function buildTrackIndexIdempotencyKey(trackId, updatedAt) {
  return `${TRACK_INDEX_JOB_TYPE}:${hashString(`${trackId}:${updatedAt}`)}`;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
  return JSON.parse(raw);
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body,
  };
}
