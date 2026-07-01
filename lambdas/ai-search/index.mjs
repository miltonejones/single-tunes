/**
 * ai-search Lambda
 *
 * POST /search
 * Body: { query: string, types?: ('track'|'album'|'artist')[], limit?: number }
 * Response: { tracks: ITrackItem[], albums: IGridItem[], artists: IGridItem[] }
 *
 * Vectors live in S3 as a single gzip-compressed JSON blob written by the
 * cache-rebuild Lambda.  On cold start the S3 fetch begins at module-init
 * time (before the handler fires) and runs in parallel with the Bedrock
 * embed call, so total latency ≈ max(S3_load, Bedrock_embed) ≈ 1–2 s.
 * The result is kept in module scope for 30 minutes so warm invocations
 * only pay the Bedrock cost (~500 ms).
 *
 * Runtime: Node.js 20.x
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const s3 = new S3Client({});
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const CACHE_BUCKET = process.env.CACHE_BUCKET;
const CACHE_KEY = 'vectors.json.gz';
const EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
const EMBED_DIM = 256;
const CACHE_TTL_MS = 30 * 60 * 1000;

const gunzipAsync = promisify(gunzip);

// Module-scope cache — persists across warm invocations
let moduleCache = null; // { items: [], expiresAt: number }

// Start the S3 fetch immediately at module-init time.
// On cold start this runs before the handler is called, so by the time
// the handler awaits it the download may already be complete.
let cacheLoadPromise = fetchFromS3();

async function fetchFromS3() {
  const res = await s3.send(new GetObjectCommand({ Bucket: CACHE_BUCKET, Key: CACHE_KEY }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  const items = JSON.parse((await gunzipAsync(Buffer.concat(chunks))).toString());
  moduleCache = { items, expiresAt: Date.now() + CACHE_TTL_MS };
  console.log(`Vector cache loaded: ${items.length} items`);
  return items;
}

async function getItems(types) {
  // Warm hit — return immediately
  if (moduleCache && Date.now() < moduleCache.expiresAt) {
    const all = moduleCache.items;
    return types?.length ? all.filter((i) => types.includes(i.type)) : all;
  }

  // Await the in-flight load started at module init (cold start first request)
  const all = await cacheLoadPromise;

  // If TTL expired on a long-lived container, kick off a background refresh
  if (moduleCache && Date.now() >= moduleCache.expiresAt) {
    cacheLoadPromise = fetchFromS3();
  }

  return types?.length ? all.filter((i) => types.includes(i.type)) : all;
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

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const body = JSON.parse(event.body ?? '{}');
  const { query, types = ['track', 'album', 'artist'], limit = 20 } = body;

  if (!query?.trim()) {
    return jsonResponse(400, { error: 'query is required' });
  }

  // Bedrock embed + S3 cache load run concurrently
  const [queryEmbedding, allItems] = await Promise.all([embed(query), getItems(types)]);

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
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
