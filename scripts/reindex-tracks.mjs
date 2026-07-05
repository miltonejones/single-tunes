#!/usr/bin/env node
/**
 * Re-enqueue track indexing jobs by replaying synthetic `track.created` events.
 *
 * Usage:
 *   npm run reindex:tracks
 *
 * Optional env vars:
 *   TUNE_API_ENDPOINT     Catalog API base URL
 *   AI_SEARCH_ENDPOINT    AI API base URL with /track-events route
 *   BATCH_SIZE            Events per POST (default 25)
 *   START_PAGE            Catalog page to begin from (default 1)
 *   MAX_TRACKS            Stop after enqueuing this many tracks
 *   REINDEX_TIMESTAMP     Synthetic createdAt/updatedAt fallback when catalog lacks timestamps
 */

const TUNE_API_ENDPOINT =
  process.env.TUNE_API_ENDPOINT ?? 'https://u8m0btl997.execute-api.us-east-1.amazonaws.com';
const AI_SEARCH_ENDPOINT =
  process.env.AI_SEARCH_ENDPOINT ?? 'https://ohb29b452e.execute-api.us-east-1.amazonaws.com';
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 25);
const START_PAGE = Number(process.env.START_PAGE ?? 1);
const MAX_TRACKS = Number(process.env.MAX_TRACKS ?? 0);
const REINDEX_TIMESTAMP = process.env.REINDEX_TIMESTAMP ?? new Date().toISOString();

function log(message) {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
}

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} → ${response.status} ${response.statusText}`);
  return response.json();
}

async function postEvents(events) {
  const response = await fetch(`${AI_SEARCH_ENDPOINT}/track-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!response.ok && response.status !== 207) {
    const body = await response.text().catch(() => '');
    throw new Error(`POST /track-events → ${response.status} ${response.statusText}: ${body}`);
  }
  return response.json();
}

function buildTrackCreatedEvent(track) {
  const createdAt = track.createdAt ?? track.CreatedAt ?? track.updatedAt ?? track.UpdatedAt ?? REINDEX_TIMESTAMP;
  const updatedAt = track.updatedAt ?? track.UpdatedAt ?? createdAt;
  return {
    type: 'track.created',
    version: 1,
    occurredAt: updatedAt,
    source: 'single-tunes',
    track: {
      id: String(track.ID),
      createdAt,
      updatedAt,
    },
  };
}

async function fetchTracks() {
  const tracks = [];
  let page = START_PAGE;

  while (true) {
    const url = `${TUNE_API_ENDPOINT}/request/ID/DESC/${page}/music`;
    const data = await get(url);
    const pageTracks = data.records ?? [];
    if (pageTracks.length === 0) break;

    tracks.push(...pageTracks);
    log(`Fetched page ${page} (${tracks.length}/${data.count ?? tracks.length})`);

    if ((MAX_TRACKS > 0 && tracks.length >= MAX_TRACKS) || tracks.length >= (data.count ?? Infinity)) {
      break;
    }
    page++;
  }

  return MAX_TRACKS > 0 ? tracks.slice(0, MAX_TRACKS) : tracks;
}

log('=== SkyTunes track reindex enqueue ===');
log(`Catalog API : ${TUNE_API_ENDPOINT}`);
log(`AI API      : ${AI_SEARCH_ENDPOINT}`);
log(`Batch size  : ${BATCH_SIZE}`);

const tracks = await fetchTracks();
log(`Loaded ${tracks.length} track(s)`);

let accepted = 0;
for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
  const batch = tracks.slice(i, i + BATCH_SIZE).map(buildTrackCreatedEvent);
  const result = await postEvents(batch);
  accepted += result.accepted ?? batch.length;
  log(`Enqueued ${Math.min(i + BATCH_SIZE, tracks.length)}/${tracks.length} track(s)`);
}

log(`Done. Accepted ${accepted} track indexing event(s).`);
