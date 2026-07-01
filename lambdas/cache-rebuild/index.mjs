/**
 * cache-rebuild Lambda
 *
 * POST /rebuild-cache
 * Scans the full sky-tunes-vectors DynamoDB table and writes a single
 * gzip-compressed JSON array to S3.  The ai-search Lambda loads this
 * file at cold-start instead of paginating through DynamoDB.
 *
 * Runtime: Node.js 20.x
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { gzip } from 'zlib';
import { promisify } from 'util';

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});
const TABLE = process.env.TABLE_NAME;
const CACHE_BUCKET = process.env.CACHE_BUCKET;
export const CACHE_KEY = 'vectors.json.gz';

const gzipAsync = promisify(gzip);

async function scanAll() {
  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }));
    items.push(...(res.Items ?? []).map(unmarshall));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export const handler = async () => {
  const items = await scanAll();
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(items)));
  await s3.send(new PutObjectCommand({
    Bucket: CACHE_BUCKET,
    Key: CACHE_KEY,
    Body: compressed,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
  }));
  return jsonResponse(200, { itemCount: items.length, bytes: compressed.length });
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
