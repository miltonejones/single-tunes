#!/usr/bin/env node
/**
 * ingest-vectors.mjs
 *
 * One-time (and re-runnable) ingestion script that reads the full SkyTunes
 * catalog and sends it to the AI ingest Lambda for embedding + indexing.
 *
 * Usage:
 *   node scripts/ingest-vectors.mjs
 *
 * Environment variables (or edit the CONFIG block below):
 *   TUNE_API_ENDPOINT   — existing catalog API base URL
 *   AI_INGEST_ENDPOINT  — new Lambda endpoint (POST /ingest)
 *   BATCH_SIZE          — entities per POST (default: 50)
 *
 * Requires Node 18+ (uses built-in fetch and top-level await).
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────

const TUNE_API =
  process.env.TUNE_API_ENDPOINT ??
  'https://u8m0btl997.execute-api.us-east-1.amazonaws.com';

const AI_INGEST =
  process.env.AI_INGEST_ENDPOINT ??
  'https://<ai-lambda-id>.execute-api.us-east-1.amazonaws.com';

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 50);
const PAGE_SIZE = 100; // matches the app's PAGE_SIZE constant

// ── HELPERS ───────────────────────────────────────────────────────────────────

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  return res.json();
}

async function postBatch(entities) {
  const res = await fetch(`${AI_INGEST}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entities }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST /ingest → ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

/** Send entities in batches, logging progress. */
async function ingestAll(entities, label) {
  let ingested = 0;
  let failed = 0;
  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE);
    try {
      const result = await postBatch(batch);
      ingested += result.ingested ?? batch.length;
      failed += result.failed ?? 0;
    } catch (err) {
      log(`  ERROR in batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      failed += batch.length;
    }
    const done = Math.min(i + BATCH_SIZE, entities.length);
    log(`  ${label}: ${done}/${entities.length} sent (${failed} failed)`);
  }
  return { ingested, failed };
}

// ── EMBEDDING TEXT BUILDERS ───────────────────────────────────────────────────

function trackText(t) {
  return `"${t.Title}" by ${t.artistName} from the album ${t.albumName}. Genre: ${t.Genre || 'unknown'}.`;
}

function albumText(a) {
  const artist = a.artistName ? ` by ${a.artistName}` : '';
  return `Album: "${a.Name}"${artist}. ${a.TrackCount} tracks.`;
}

function artistText(a) {
  return `Artist: "${a.Name}". ${a.TrackCount} tracks in catalog.`;
}

// ── CATALOG FETCHERS ──────────────────────────────────────────────────────────

/** Paginate GET /request/{field}/{dir}/{page}/music for all tracks. */
async function fetchAllTracks() {
  const tracks = [];
  let page = 1;
  while (true) {
    const url = `${TUNE_API}/request/ID/DESC/${page}/music`;
    const data = await get(url);
    tracks.push(...data.records);
    log(`  Tracks: fetched page ${page} (${tracks.length}/${data.count})`);
    if (tracks.length >= data.count) break;
    page++;
  }
  return tracks;
}

/** Paginate GET /request/{field}/{dir}/{page}/album for all albums. */
async function fetchAllAlbums() {
  const albums = [];
  let page = 1;
  while (true) {
    const url = `${TUNE_API}/request/Name/ASC/${page}/album`;
    const data = await get(url);
    albums.push(...data.records);
    log(`  Albums: fetched page ${page} (${albums.length}/${data.count})`);
    if (albums.length >= data.count) break;
    page++;
  }
  return albums;
}

/** Paginate GET /request/{field}/{dir}/{page}/artist for all artists. */
async function fetchAllArtists() {
  const artists = [];
  let page = 1;
  while (true) {
    const url = `${TUNE_API}/request/Name/ASC/${page}/artist`;
    const data = await get(url);
    artists.push(...data.records);
    log(`  Artists: fetched page ${page} (${artists.length}/${data.count})`);
    if (artists.length >= data.count) break;
    page++;
  }
  return artists;
}

// ── ENTITY BUILDERS ───────────────────────────────────────────────────────────

function buildTrackEntities(tracks) {
  return tracks.map((t) => ({
    id: `track-${t.ID}`,
    type: 'track',
    text: trackText(t),
    metadata: {
      ID: t.ID,
      Title: t.Title,
      FileKey: t.FileKey,
      albumImage: t.albumImage ?? null,
      trackId: t.trackId,
      Genre: t.Genre,
      genreKey: t.genreKey ?? null,
      albumFk: t.albumFk ?? null,
      artistFk: t.artistFk ?? null,
      discNumber: t.discNumber ?? null,
      trackTime: t.trackTime ?? 0,
      trackNumber: t.trackNumber ?? null,
      explicit: t.explicit ?? false,
      artistName: t.artistName,
      albumName: t.albumName,
    },
  }));
}

function buildAlbumEntities(albums) {
  return albums.map((a) => ({
    id: `album-${a.ID}`,
    type: 'album',
    text: albumText(a),
    metadata: {
      ID: a.ID,
      Name: a.Name,
      Thumbnail: a.Thumbnail ?? null,
      TrackCount: a.TrackCount,
      artistName: a.artistName ?? null,
    },
  }));
}

function buildArtistEntities(artists) {
  return artists.map((a) => ({
    id: `artist-${a.ID}`,
    type: 'artist',
    text: artistText(a),
    metadata: {
      ID: a.ID,
      Name: a.Name,
      Thumbnail: a.Thumbnail ?? null,
      TrackCount: a.TrackCount,
      artistName: null,
    },
  }));
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

log('=== SkyTunes vector ingestion ===');
log(`Catalog API : ${TUNE_API}`);
log(`Ingest API  : ${AI_INGEST}`);
log(`Batch size  : ${BATCH_SIZE}`);
log('');

// Fetch all catalog data
log('Fetching tracks…');
const tracks = await fetchAllTracks();
log(`  → ${tracks.length} tracks\n`);

log('Fetching albums…');
const albums = await fetchAllAlbums();
log(`  → ${albums.length} albums\n`);

log('Fetching artists…');
const artists = await fetchAllArtists();
log(`  → ${artists.length} artists\n`);

// Build entity payloads
const trackEntities = buildTrackEntities(tracks);
const albumEntities = buildAlbumEntities(albums);
const artistEntities = buildArtistEntities(artists);

// Ingest
log('Ingesting tracks…');
const trackResult = await ingestAll(trackEntities, 'tracks');

log('\nIngesting albums…');
const albumResult = await ingestAll(albumEntities, 'albums');

log('\nIngesting artists…');
const artistResult = await ingestAll(artistEntities, 'artists');

// Summary
log('\n=== Done ===');
log(`Tracks  : ${trackResult.ingested} ingested, ${trackResult.failed} failed`);
log(`Albums  : ${albumResult.ingested} ingested, ${albumResult.failed} failed`);
log(`Artists : ${artistResult.ingested} ingested, ${artistResult.failed} failed`);

const totalFailed = trackResult.failed + albumResult.failed + artistResult.failed;
if (totalFailed > 0) {
  process.exitCode = 1;
}
