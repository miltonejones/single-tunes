/**
 * ai-search Lambda
 *
 * POST /search
 * Body: { query: string, types?: ('track'|'album'|'artist')[], limit?: number }
 * Response: { tracks: ITrackItem[], albums: IGridItem[], artists: IGridItem[] }
 *
 * Embeds the natural-language query via Bedrock, scans the DynamoDB vector
 * table in parallel, computes cosine similarity in Lambda memory, and returns
 * the top `limit` results per entity type.
 *
 * Runtime: Node.js 20.x (AWS SDK v3 included in runtime, no bundling needed)
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddb = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const TABLE = process.env.TABLE_NAME;
const EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
const EMBED_DIM = 256; // must match the dimension used during ingestion

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Bedrock embedding ─────────────────────────────────────────────────────────

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

// ── DynamoDB paginated scan ───────────────────────────────────────────────────

async function scanAll(types) {
  const items = [];
  let lastKey;

  const filterByType = types?.length > 0;
  const filterExpr = filterByType
    ? '#t IN (' + types.map((_, i) => `:t${i}`).join(',') + ')'
    : undefined;
  const exprNames = filterByType ? { '#t': 'type' } : undefined;
  const exprValues = filterByType
    ? Object.fromEntries(types.map((t, i) => [`:t${i}`, { S: t }]))
    : undefined;

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        ExclusiveStartKey: lastKey,
        ...(filterByType && {
          FilterExpression: filterExpr,
          ExpressionAttributeNames: exprNames,
          ExpressionAttributeValues: exprValues,
        }),
      }),
    );
    items.push(...(res.Items ?? []).map(unmarshall));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const body = JSON.parse(event.body ?? '{}');
  const { query, types = ['track', 'album', 'artist'], limit = 20 } = body;

  if (!query?.trim()) {
    return jsonResponse(400, { error: 'query is required' });
  }

  // Embed query and scan table in parallel to minimise latency
  const [queryEmbedding, allItems] = await Promise.all([
    embed(query),
    scanAll(types),
  ]);

  // Score every item
  const scored = allItems.map((item) => ({
    type: item.type,
    metadata: item.metadata,
    score: cosineSim(queryEmbedding, item.embedding),
  }));

  const topByType = (type) =>
    scored
      .filter((i) => i.type === type)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((i) => i.metadata);

  return jsonResponse(200, {
    tracks: topByType('track'),
    albums: topByType('album'),
    artists: topByType('artist'),
  });
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
