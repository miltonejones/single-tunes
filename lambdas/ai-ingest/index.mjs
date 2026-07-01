/**
 * ai-ingest Lambda
 *
 * POST /ingest
 * Body: { entities: [{ id, type, text, metadata }] }
 *
 * For each entity: embeds `text` via Bedrock Titan v2, writes the
 * item (id, type, embedding, metadata) to the sky-tunes-vectors DynamoDB table.
 * Idempotent — re-running overwrites existing items safely.
 *
 * Runtime: Node.js 20.x (AWS SDK v3 included in runtime, no bundling needed)
 */

import { DynamoDBClient, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { marshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const TABLE = process.env.TABLE_NAME;
const EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
const EMBED_DIM = 1024; // Titan v2 supports 256 | 512 | 1024
const CONCURRENCY = 5;  // parallel Bedrock calls per mini-batch

async function embed(text) {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: EMBED_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ inputText: text, dimensions: EMBED_DIM, normalize: true }),
    }),
  );
  const { embedding } = JSON.parse(Buffer.from(res.body).toString());
  return embedding;
}

/** Run fn over items with at most `limit` concurrent executions. */
async function mapConcurrent(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.allSettled(chunk.map(fn))));
  }
  return results;
}

export const handler = async (event) => {
  const body = JSON.parse(event.body ?? '{}');
  const entities = body.entities ?? [];

  if (!entities.length) {
    return jsonResponse(400, { error: 'entities array is required' });
  }

  let ingested = 0;
  let failed = 0;
  const errors = [];

  // Embed all entities with bounded concurrency
  const embedded = await mapConcurrent(entities, CONCURRENCY, async (entity) => {
    const embedding = await embed(entity.text);
    return { entity, embedding };
  });

  // BatchWriteItem accepts max 25 items per call
  const puts = [];
  for (const result of embedded) {
    if (result.status === 'rejected') {
      errors.push('(embedding failed)');
      failed++;
      continue;
    }
    const { entity, embedding } = result.value;
    puts.push({
      PutRequest: {
        Item: marshall(
          { id: entity.id, type: entity.type, embedding, metadata: entity.metadata },
          { removeUndefinedValues: true },
        ),
      },
    });
  }

  for (let i = 0; i < puts.length; i += 25) {
    const batch = puts.slice(i, i + 25);
    try {
      await ddb.send(new BatchWriteItemCommand({ RequestItems: { [TABLE]: batch } }));
      ingested += batch.length;
    } catch (err) {
      errors.push(err.message);
      failed += batch.length;
    }
  }

  return jsonResponse(200, { ingested, failed, errors });
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
