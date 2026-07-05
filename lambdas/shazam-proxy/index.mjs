/**
 * shazam-proxy Lambda
 *
 * Forwards the browser's song-recognition calls to the Shazam API, injecting
 * the Bearer key from an environment variable so the key never ships to the
 * client. Mounted on the AI HTTP API under /shazam/*:
 *
 *   POST /shazam/recognize        — body is the raw audio clip (audio/webm|mp4)
 *   POST /shazam/results/{uuid}   — poll a recognition job
 *
 * The upstream /recognize endpoint expects a multipart file upload, so the
 * raw clip bytes (base64-encoded by API Gateway) are rewrapped in FormData
 * here. Whatever the upstream returns (status + JSON body) is passed back.
 *
 * Runtime: Node.js 20.x (global fetch/FormData/Blob)
 */

const SHAZAM_API_ENDPOINT = process.env.SHAZAM_API_ENDPOINT ?? 'https://shazam-api.com/api';
const SHAZAM_API_KEY = process.env.SHAZAM_API_KEY;

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? 'GET';
  if (method === 'OPTIONS') return resp(204, '');

  // rawPath looks like /shazam/results/uuid — drop the /shazam mount prefix.
  const rawPath = event.rawPath ?? '';
  const upstreamPath = rawPath.replace(/^\/shazam/, '') || '/';
  const url = `${SHAZAM_API_ENDPOINT}${upstreamPath}`;

  const init = { method, headers: { authorization: `Bearer ${SHAZAM_API_KEY}` } };
  if (upstreamPath === '/recognize') {
    const clip = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
    const contentType = event.headers?.['content-type'] || 'audio/webm';
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([clip], { type: contentType }), `clip.${ext}`);
    init.body = form;
  }

  try {
    const upstream = await fetch(url, init);
    return resp(upstream.status, await upstream.text());
  } catch (e) {
    return resp(502, JSON.stringify({ error: `shazam proxy failed: ${e.message}` }));
  }
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body,
  };
}
