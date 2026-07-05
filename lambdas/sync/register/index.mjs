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

import { SQSClient, CreateQueueCommand, DeleteQueueCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

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

  // A re-registration replaces this instance's session row; delete the queue
  // the old row pointed at (best-effort) so it doesn't linger as an orphan.
  try {
    const existing = await ddb.send(
      new GetItemCommand({
        TableName: SESSIONS_TABLE,
        Key: { userKey: { S: userKey }, instanceId: { S: instanceId } },
        ConsistentRead: true,
      }),
    );
    const oldQueueUrl = existing.Item?.queueUrl?.S;
    if (oldQueueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl: oldQueueUrl }));
  } catch {
    // row lookup / queue deletion is cleanup only — never block registration
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
  // Queue names are capped at 80 chars including ".fifo". userKey is a 64-char
  // sha-256 hex, so only IT may be truncated — the instanceId must survive
  // whole or every instance of a user collides onto one queue (each reap then
  // deletes the shared queue out from under all live tabs). The per-call nonce
  // makes each registration's name unique, sidestepping SQS's 60-second
  // name-reuse block (QueueDeletedRecently) when a reaped instance re-registers.
  const cleanInstanceId = instanceId.replace(/-/g, '');
  const nonce = Math.random().toString(36).slice(2, 8);
  const base = `${userKey.slice(0, 18)}-${cleanInstanceId}-${nonce}`
    .replace(/[^A-Za-z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const maxBaseLength = 80 - 'sky-tunes-sync-'.length - '.fifo'.length;
  return `sky-tunes-sync-${base.slice(0, maxBaseLength)}.fifo`;
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