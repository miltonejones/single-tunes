/**
 * sync-register Lambda
 *
 * POST /sync/register
 * Body: { userKey: string, instanceId: string }
 * Response: { queueUrl: string }
 *
 * Allocates a dedicated FIFO SQS queue for this instance and records a session
 * row in DynamoDB so the publish Lambda can fan state out to it. SQS messages
 * are consumed-once, so cross-instance fan-out requires one queue per instance
 * (a single shared queue would split messages across followers).
 *
 * Uses the low-level @aws-sdk/client-dynamodb commands (the document-client
 * @aws-sdk/lib-dynamodb is not bundled in the Lambda Node 20 runtime), with a
 * tiny inline marshaller for the few scalar fields we store.
 *
 * Runtime: Node.js 20.x (AWS SDK v3 in the runtime)
 */

import { SQSClient, CreateQueueCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const sqs = new SQSClient({});
const ddb = new DynamoDBClient({});

const SESSIONS_TABLE = process.env.SYNC_SESSIONS_TABLE;
const SESSION_TTL_MS = 60_000;

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return resp(204, '');

  let body;
  try {
    body = parseBody(event);
  } catch {
    return resp(400, JSON.stringify({ error: 'invalid body' }));
  }
  const { userKey, instanceId } = body;
  if (!userKey || !instanceId) {
    return resp(400, JSON.stringify({ error: 'userKey and instanceId required' }));
  }

  const queueName = queueNameFor(userKey, instanceId);
  let queueUrl;
  try {
    const res = await sqs.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'false',
          MessageRetentionPeriod: '300',
          VisibilityTimeout: '20',
        },
      }),
    );
    queueUrl = res.QueueUrl;
  } catch (e) {
    return resp(500, JSON.stringify({ error: `createQueue failed: ${e.message}` }));
  }

  const now = Date.now();
  await ddb.send(
    new PutItemCommand({
      TableName: SESSIONS_TABLE,
      Item: marshall({
        userKey,
        instanceId,
        queueUrl,
        lastHeartbeat: now,
        expiresAt: now + SESSION_TTL_MS,
      }),
    }),
  );

  return resp(200, JSON.stringify({ queueUrl }));
};

function queueNameFor(userKey, instanceId) {
  // Remove hyphens from UUID to avoid consecutive hyphens
  const cleanInstanceId = instanceId.replace(/-/g, '');
  const baseName = `${userKey}-${cleanInstanceId}`.replace(/[^A-Za-z0-9_.-]/g, '-');
  // Remove consecutive hyphens and leading/trailing hyphens
  const cleaned = baseName.replace(/-+/g, '-').replace(/^-|-$/g, '');
  // Ensure we have room for the .fifo suffix (80 chars max for the full name)
  const maxBaseLength = 80 - 'sky-tunes-sync-'.length - '.fifo'.length;
  const truncated = cleaned.slice(0, maxBaseLength);
  return `sky-tunes-sync-${truncated}.fifo`;
}

/** Marshal a flat object of strings/numbers/booleans into DynamoDB AttributeValues. */
function marshall(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'number') out[k] = { N: String(v) };
    else if (typeof v === 'boolean') out[k] = { BOOL: v };
    else out[k] = { S: String(v) };
  }
  return out;
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