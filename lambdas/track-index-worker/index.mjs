/**
 * track-index-worker Lambda
 *
 * SQS consumer for provider-agnostic track indexing jobs.
 * For each job it:
 *   1. checks idempotency state
 *   2. fetches track data from the catalog API
 *   3. builds a normalized searchable document
 *   4. upserts through a pluggable index client (stub by default)
 *
 * Runtime: Node.js 20.x
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});

const TUNE_API_ENDPOINT =
  process.env.TUNE_API_ENDPOINT ?? 'https://u8m0btl997.execute-api.us-east-1.amazonaws.com';
const TRACK_INDEX_STATE_TABLE = process.env.TRACK_INDEX_STATE_TABLE;
const TRACK_INDEX_SCHEMA_VERSION = 1;
const completedKeys = new Set();

export const handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records ?? []) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'track_index_job_failed',
          messageId: record.messageId,
          retryable: isRetryableError(error),
          error: error.message,
        }),
      );
      if (isRetryableError(error)) {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  return { batchItemFailures };
};

async function processRecord(record) {
  const job = parseJob(record.body);
  if (!(await shouldProcess(job.idempotencyKey))) {
    console.log(
      JSON.stringify({
        event: 'track_index_job_skipped',
        trackId: job.trackId,
        idempotencyKey: job.idempotencyKey,
      }),
    );
    return;
  }

  const startedAt = Date.now();
  const track = await fetchTrack(job.trackId);
  const document = buildTrackSearchDocument(track, job.updatedAt);

  const indexClient = createIndexClient();
  await indexClient.upsert(document);
  await markProcessed(job.idempotencyKey);

  console.log(
    JSON.stringify({
      event: 'track_index_job_completed',
      trackId: job.trackId,
      idempotencyKey: job.idempotencyKey,
      durationMs: Date.now() - startedAt,
      attempt: Number(record.attributes?.ApproximateReceiveCount ?? 1),
    }),
  );
}

function parseJob(body) {
  const job = JSON.parse(body);
  if (job?.jobType !== 'track.index' || !job?.trackId || !job?.updatedAt || !job?.idempotencyKey) {
    throw new Error('invalid track.index job payload');
  }
  return job;
}

async function shouldProcess(idempotencyKey) {
  if (!TRACK_INDEX_STATE_TABLE) {
    return !completedKeys.has(idempotencyKey);
  }

  const existing = await ddb.send(
    new GetItemCommand({
      TableName: TRACK_INDEX_STATE_TABLE,
      Key: { idempotencyKey: { S: idempotencyKey } },
      ConsistentRead: true,
    }),
  );
  return existing.Item?.status?.S !== 'completed';
}

async function markProcessed(idempotencyKey) {
  if (!TRACK_INDEX_STATE_TABLE) {
    completedKeys.add(idempotencyKey);
    return;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
  await ddb.send(
    new PutItemCommand({
      TableName: TRACK_INDEX_STATE_TABLE,
      Item: {
        idempotencyKey: { S: idempotencyKey },
        status: { S: 'completed' },
        completedAt: { S: new Date().toISOString() },
        expiresAt: { N: String(expiresAt) },
      },
    }),
  );
}

async function fetchTrack(trackId) {
  let response;
  try {
    response = await fetch(`${TUNE_API_ENDPOINT}/track/${encodeURIComponent(trackId)}`);
  } catch (error) {
    throw new RetryableError(`track fetch failed: ${error.message}`);
  }

  if (!response.ok) {
    const message = `track fetch failed: ${response.status} ${response.statusText}`;
    if (response.status >= 500 || response.status === 429) throw new RetryableError(message);
    throw new Error(message);
  }

  const payload = await response.json();
  const track = extractTrack(payload);
  if (!track) throw new RetryableError(`track ${trackId} not yet available from catalog`);
  return track;
}

function extractTrack(payload) {
  if (payload && typeof payload === 'object' && payload.Title && payload.FileKey) {
    return payload;
  }
  if (Array.isArray(payload?.row) && payload.row[0]) return payload.row[0];
  if (Array.isArray(payload?.records) && payload.records[0]) return payload.records[0];
  if (Array.isArray(payload?.related?.records) && payload.related.records[0]) {
    return payload.related.records[0];
  }
  return null;
}

function buildTrackSearchDocument(track, updatedAt) {
  return {
    id: `track-${track.ID}`,
    type: 'track',
    version: TRACK_INDEX_SCHEMA_VERSION,
    updatedAt,
    searchableText: normalizeTrackSearchText(track),
    metadata: {
      ID: track.ID,
      Title: normalizeField(track.Title),
      FileKey: track.FileKey,
      albumImage: track.albumImage ?? null,
      trackId: track.trackId ?? null,
      Genre: normalizeField(track.Genre),
      genreKey: track.genreKey ?? null,
      albumFk: track.albumFk ?? null,
      artistFk: track.artistFk ?? null,
      discNumber: track.discNumber ?? null,
      trackTime: track.trackTime ?? 0,
      trackNumber: track.trackNumber ?? null,
      explicit: track.explicit ?? false,
      artistName: normalizeField(track.artistName),
      albumName: normalizeField(track.albumName),
    },
  };
}

function normalizeTrackSearchText(track) {
  return [
    `track ${normalizeField(track.Title)}`,
    `artist ${normalizeField(track.artistName)}`,
    `album ${normalizeField(track.albumName)}`,
    `genre ${normalizeField(track.Genre) || 'unknown'}`,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function normalizeField(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createIndexClient() {
  const mode = process.env.TRACK_INDEX_UPSERT_MODE ?? 'stub';
  if (mode === 'stub') {
    return {
      async upsert(document) {
        console.log(
          JSON.stringify({
            event: 'track_index_upsert_stub',
            documentId: document.id,
            type: document.type,
          }),
        );
      },
    };
  }

  if (mode === 'http') {
    const endpoint = process.env.TRACK_INDEX_UPSERT_URL;
    if (!endpoint) throw new Error('TRACK_INDEX_UPSERT_URL is required when TRACK_INDEX_UPSERT_MODE=http');
    const apiKey = process.env.TRACK_INDEX_UPSERT_API_KEY;
    return {
      async upsert(document) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: apiKey } : {}),
          },
          body: JSON.stringify({ operation: 'upsert', document }),
        });
        if (!response.ok) {
          throw new RetryableError(`index upsert failed: ${response.status} ${response.statusText}`);
        }
      },
    };
  }

  throw new Error(`Unsupported TRACK_INDEX_UPSERT_MODE: ${mode}`);
}

class RetryableError extends Error {}

function isRetryableError(error) {
  return error instanceof RetryableError;
}
