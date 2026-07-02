/**
 * recorder-proxy Lambda
 *
 * Forwards the browser's recorder calls to the recorder cloud API, injecting
 * the `x-api-key` from an environment variable so the key never ships to the
 * client. Mounted on the AI HTTP API under /recorder/*:
 *
 *   GET  /recorder/search/{term}/{limit}
 *   POST /recorder/record
 *   GET  /recorder/record/{batchId}
 *
 * Whatever the upstream returns (status + JSON body) is passed straight back.
 *
 * Runtime: Node.js 20.x (global fetch)
 */

const RECORDER_API_ENDPOINT = process.env.RECORDER_API_ENDPOINT;
const RECORDER_API_KEY = process.env.RECORDER_API_KEY;

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? 'GET';
  if (method === 'OPTIONS') return resp(204, '');

  // rawPath looks like /recorder/search/term/5 — drop the /recorder mount prefix.
  const rawPath = event.rawPath ?? '';
  const upstreamPath = rawPath.replace(/^\/recorder/, '') || '/';
  const qs = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const url = `${RECORDER_API_ENDPOINT}${upstreamPath}${qs}`;

  const init = { method, headers: { 'x-api-key': RECORDER_API_KEY } };
  if (method !== 'GET' && method !== 'HEAD' && event.body != null) {
    init.headers['content-type'] = 'application/json';
    init.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body;
  }

  try {
    const upstream = await fetch(url, init);
    return resp(upstream.status, await upstream.text());
  } catch (e) {
    return resp(502, JSON.stringify({ error: `recorder proxy failed: ${e.message}` }));
  }
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body,
  };
}
