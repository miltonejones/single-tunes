/**
 * sync-publish Lambda
 *
 * POST /sync/publish
 * Body: { userKey, instanceId, state, claim: boolean }
 * Response: { granted: boolean, leaderInstanceId?: string }
 *
 * Leadership model: "newest play wins" via a monotonic epoch stored on the
 * lease. A claim (claim:true, sent on a local user action) takes the lease
 * iff its epoch (state.updatedAt) is newer than the stored one. A state update
 * (claim:false, sent periodically while leading) only applies iff this
 * instance is still the recorded leader and its lease hasn't expired. This
 * prevents ping-pong: state updates never bump the epoch, so a displaced
 * leader's next update fails and it stands down.
 *
 * On a successful claim/update, the state is fanned out to every live session
 * queue for this userKey (one SQS SendMessage per peer instance).
 *
 * Runtime: Node.js 20.x (AWS SDK v3 in the runtime)
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  DynamoDBClient,
  UpdateItemCommand,
  QueryCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const sqs = new SQSClient({});
const ddb = new DynamoDBClient({});

const SESSIONS_TABLE = process.env.SYNC_SESSIONS_TABLE;
const LEASES_TABLE = process.env.SYNC_LEASES_TABLE;
const LEASE_MS = 60_000;
const SESSION_TTL_MS = 60_000;

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return resp(204, '');

  let body;
  try {
    body = parseBody(event);
  } catch {
    return resp(400, JSON.stringify({ error: 'invalid body' }));
  }
  const { userKey, instanceId, state, claim } = body;
  if (!userKey || !instanceId || !state) {
    return resp(400, JSON.stringify({ error: 'userKey, instanceId, state required' }));
  }

  const now = Date.now();
  const stateJson = JSON.stringify(state);
  const epoch = Number(state.updatedAt) || now;
  const key = { userKey: { S: userKey } };

  let granted = false;
  try {
    if (claim) {
      await ddb.send(
        new UpdateItemCommand({
          TableName: LEASES_TABLE,
          Key: key,
          UpdateExpression:
            'SET leaderInstanceId = :me, #ep = :epoch, leaseExpires = :exp, #st = :state',
          ConditionExpression: 'attribute_not_exists(#ep) OR :epoch > #ep',
          ExpressionAttributeNames: { '#ep': 'epoch', '#st': 'state' },
          ExpressionAttributeValues: {
            ':me': { S: instanceId },
            ':epoch': { N: String(epoch) },
            ':exp': { N: String(now + LEASE_MS) },
            ':state': { S: stateJson },
          },
        }),
      );
      granted = true;
    } else {
      await ddb.send(
        new UpdateItemCommand({
          TableName: LEASES_TABLE,
          Key: key,
          UpdateExpression: 'SET leaseExpires = :exp, #st = :state',
          ConditionExpression: 'leaderInstanceId = :me AND leaseExpires > :now',
          ExpressionAttributeNames: { '#st': 'state' },
          ExpressionAttributeValues: {
            ':me': { S: instanceId },
            ':now': { N: String(now) },
            ':exp': { N: String(now + LEASE_MS) },
            ':state': { S: stateJson },
          },
        }),
      );
      granted = true;
    }
  } catch (e) {
    if (e.name !== 'ConditionalCheckFailedException') {
      return resp(500, JSON.stringify({ error: `lease update failed: ${e.message}` }));
    }
    granted = false;
  }

  if (!granted) {
    const cur = await ddb.send(
      new GetItemCommand({ TableName: LEASES_TABLE, Key: key, ConsistentRead: true }),
    );
    return resp(
      200,
      JSON.stringify({ granted: false, leaderInstanceId: cur.Item?.leaderInstanceId?.S }),
    );
  }

  await fanOut(userKey, instanceId, stateJson, now);
  return resp(200, JSON.stringify({ granted: true, leaderInstanceId: instanceId }));
};

async function fanOut(userKey, selfInstanceId, stateJson, now) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: SESSIONS_TABLE,
      KeyConditionExpression: 'userKey = :uk',
      ExpressionAttributeValues: { ':uk': { S: userKey } },
      ConsistentRead: true,
    }),
  );
  const items = res.Items ?? [];
  await Promise.all(
    items.map(async (item) => {
      const theirId = item.instanceId?.S;
      if (theirId === selfInstanceId) return;
      const last = item.lastHeartbeat ? Number(item.lastHeartbeat.N) : 0;
      if (now - last >= SESSION_TTL_MS) return;
      const queueUrl = item.queueUrl?.S;
      if (!queueUrl) return;
      try {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: stateJson,
            MessageGroupId: userKey,
            // FIFO queue has ContentBasedDeduplication disabled, so each
            // message needs an explicit dedup id. `now` is unique per publish
            // and the random suffix breaks ties within the same millisecond.
            MessageDeduplicationId: `${now}-${theirId}-${Math.random().toString(36).slice(2, 8)}`,
          }),
        );
      } catch (e) {
        console.warn('sync-publish: sendMessage failed for %s: %s', theirId, e.message);
      }
    }),
  );
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