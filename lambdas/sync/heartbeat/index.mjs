/**
 * sync-heartbeat Lambda
 *
 * POST /sync/heartbeat
 * Body: { userKey: string, instanceId: string }
 * Response: { leaderInstanceId?: string, leaseExpires?: number, state?: object }
 *
 * Refreshes this instance's session row, reaps stale sessions (deleting their
 * queues), and returns the current lease so a displaced leader can stand down.
 *
 * Runtime: Node.js 20.x (AWS SDK v3 in the runtime)
 */

import { SQSClient, DeleteQueueCommand } from '@aws-sdk/client-sqs';
import {
  DynamoDBClient,
  UpdateItemCommand,
  QueryCommand,
  DeleteItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const sqs = new SQSClient({});
const ddb = new DynamoDBClient({});

const SESSIONS_TABLE = process.env.SYNC_SESSIONS_TABLE;
const LEASES_TABLE = process.env.SYNC_LEASES_TABLE;
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

  const now = Date.now();

  // Refresh this instance's heartbeat.
  await ddb.send(
    new UpdateItemCommand({
      TableName: SESSIONS_TABLE,
      Key: { userKey: { S: userKey }, instanceId: { S: instanceId } },
      UpdateExpression: 'SET lastHeartbeat = :now, expiresAt = :exp',
      ExpressionAttributeValues: {
        ':now': { N: String(now) },
        ':exp': { N: String(now + SESSION_TTL_MS) },
      },
    }),
  );

  // Reap stale sessions for this user (delete their queues + rows).
  await reapStaleSessions(userKey, now);

  // Return the current lease so a displaced leader can detect it lost control.
  const lease = await ddb.send(
    new GetItemCommand({
      TableName: LEASES_TABLE,
      Key: { userKey: { S: userKey } },
      ConsistentRead: true,
    }),
  );
  const item = lease.Item;
  if (!item || !item.leaderInstanceId) {
    return resp(200, JSON.stringify({}));
  }
  const flat = unmarshall(item);
  let state;
  try {
    state = item.state ? JSON.parse(item.state.S) : undefined;
  } catch {
    state = undefined;
  }
  return resp(
    200,
    JSON.stringify({
      leaderInstanceId: flat.leaderInstanceId,
      leaseExpires: flat.leaseExpires,
      state,
    }),
  );
};

async function reapStaleSessions(userKey, now) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: SESSIONS_TABLE,
      KeyConditionExpression: 'userKey = :uk',
      ExpressionAttributeValues: { ':uk': { S: userKey } },
    }),
  );
  await Promise.all(
    (res.Items ?? []).map(async (item) => {
      const last = item.lastHeartbeat ? Number(item.lastHeartbeat.N) : 0;
      if (now - last < SESSION_TTL_MS) return;
      try {
        if (item.queueUrl) await sqs.send(new DeleteQueueCommand({ QueueUrl: item.queueUrl.S }));
      } catch {
        // queue may already be gone — ignore
      }
      await ddb.send(
        new DeleteItemCommand({
          TableName: SESSIONS_TABLE,
          Key: { userKey: { S: userKey }, instanceId: item.instanceId },
        }),
      );
    }),
  );
}

function unmarshall(item) {
  const out = {};
  for (const [k, av] of Object.entries(item)) {
    if (av.S != null) out[k] = av.S;
    else if (av.N != null) out[k] = Number(av.N);
    else if (av.BOOL != null) out[k] = av.BOOL;
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