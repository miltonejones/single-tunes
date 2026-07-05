/**
 * sync-poll Lambda
 *
 * GET /sync/poll/{userKey}/{instanceId}
 * Response: { messages: SyncState[] }
 *
 * Long-polls (up to 15s) this instance's dedicated SQS queue, deletes each
 * message received, and returns the parsed state snapshots. The queue URL is
 * looked up from the session row written by sync-register.
 *
 * Runtime: Node.js 20.x (AWS SDK v3 in the runtime)
 */

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const sqs = new SQSClient({});
const ddb = new DynamoDBClient({});

const SESSIONS_TABLE = process.env.SYNC_SESSIONS_TABLE;
const WAIT_SECONDS = 15;

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return resp(204, '');

  const params = event.pathParameters ?? {};
  const userKey = decodeURIComponent(params.userKey ?? '');
  const instanceId = decodeURIComponent(params.instanceId ?? '');
  if (!userKey || !instanceId) {
    return resp(400, JSON.stringify({ error: 'userKey and instanceId required' }));
  }

  const session = await ddb.send(
    new GetItemCommand({
      TableName: SESSIONS_TABLE,
      Key: { userKey: { S: userKey }, instanceId: { S: instanceId } },
      ConsistentRead: true,
    }),
  );
  const queueUrl = session.Item?.queueUrl?.S;
  if (!queueUrl) {
    // No session row (reaped) or a row without a queue — this instance can't
    // receive anything until it re-registers.
    return resp(200, JSON.stringify({ messages: [], stale: true }));
  }

  let messages = [];
  try {
    const res = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        WaitTimeSeconds: WAIT_SECONDS,
        MaxNumberOfMessages: 10,
      }),
    );
    messages = res.Messages ?? [];
  } catch (e) {
    if (/QueueDoesNotExist|NonExistentQueue/i.test(`${e.name} ${e.message}`)) {
      // Queue was reaped out from under a still-live session row.
      return resp(200, JSON.stringify({ messages: [], stale: true }));
    }
    console.error('sync-poll: receive failed:', e);
    return resp(500, JSON.stringify({ error: `receive failed: ${e.message}` }));
  }

  const parsed = [];
  await Promise.all(
    messages.map(async (m) => {
      try {
        parsed.push(JSON.parse(m.Body));
      } catch {
        /* drop malformed */
      }
      try {
        await sqs.send(
          new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle }),
        );
      } catch {
        /* deletion best-effort */
      }
    }),
  );

  return resp(200, JSON.stringify({ messages: parsed }));
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body,
  };
}