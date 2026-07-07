/**
 * github-proxy Lambda
 *
 * Lets the browser file a GitHub issue against this repo without ever
 * shipping a personal access token to the client. The token lives only in
 * this Lambda's environment (see terraform/main.tf). Mounted on the AI HTTP
 * API under /github/*:
 *
 *   POST /github/issues   — body: { title: string, body?: string }
 *
 * Runtime: Node.js 20.x (global fetch)
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'miltonejones';
const GITHUB_REPO = process.env.GITHUB_REPO ?? 'single-tunes';

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? 'GET';
  if (method === 'OPTIONS') return resp(204, '');

  const rawPath = event.rawPath ?? '';
  const upstreamPath = rawPath.replace(/^\/github/, '') || '/';

  if (method !== 'POST' || upstreamPath !== '/issues') {
    return resp(404, JSON.stringify({ error: 'not found' }));
  }

  let payload;
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return resp(400, JSON.stringify({ error: 'invalid JSON body' }));
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!title) {
    return resp(400, JSON.stringify({ error: 'title is required' }));
  }

  const body = typeof payload.body === 'string' ? payload.body : '';

  try {
    const upstream = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${GITHUB_TOKEN}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'single-tunes-github-proxy',
        },
        body: JSON.stringify({ title, body }),
      },
    );
    return resp(upstream.status, await upstream.text());
  } catch (e) {
    return resp(502, JSON.stringify({ error: `github proxy failed: ${e.message}` }));
  }
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body,
  };
}
