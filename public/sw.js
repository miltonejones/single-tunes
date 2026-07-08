// ── Caching ──────────────────────────────────────────────────────────────────

const SHELL_CACHE = 'skytunes-shell-v2';
const API_CACHE = 'skytunes-api-v2';
const IMAGE_CACHE = 'skytunes-images-v2';

const TUNE_API_HOST = 'u8m0btl997.execute-api.us-east-1.amazonaws.com';
const PHOTO_API_HOST = 'swkwp5a4m0.execute-api.us-east-1.amazonaws.com';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sky-tunes-logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
];

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const validCaches = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !validCaches.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => clients.claim()),
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle http(s) requests
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // ── API calls (stale-while-revalidate) ──────────────────────────────────
  if (url.hostname === TUNE_API_HOST || url.hostname === PHOTO_API_HOST) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // ── Images (cache-first) ───────────────────────────────────────────────
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // ── Static assets (cache-first) ────────────────────────────────────────
  if (
    request.destination === 'style' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // ── JS modules (network-first, fallback to cache) ──────────────────────
  if (request.destination === 'script' || request.destination === 'worker') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // ── Navigation (network-first, fallback to cached index.html) ──────────
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(() =>
        caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 })),
      ),
    );
    return;
  }

  // ── Everything else (network-first) ────────────────────────────────────
  event.respondWith(networkFirst(request, SHELL_CACHE));
});

// ── Cache strategies ─────────────────────────────────────────────────────────

function isCacheable(request, response) {
  return request.method === 'GET' && response.ok && response.status !== 206;
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(request, response)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (isCacheable(request, response)) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Offline');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (isCacheable(request, response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {});

  if (cached) return cached;

  const response = await fetchPromise;
  if (response) return response;

  return new Response('Offline', { status: 503 });
}

// ── Cross-instance sync ──────────────────────────────────────────────────────

const SYNC_ENDPOINT = 'https://ohb29b452e.execute-api.us-east-1.amazonaws.com/sync';
const HEARTBEAT_MS = 20000;
const POSITION_TICK_MS = 2000;
const PUBLISH_DEBOUNCE_MS = 400;

let userKey = null;
let deviceId = null;
let queueUrl = null;
let heartbeatInterval = null;
let positionInterval = null;
let pollAbort = false;
let publishTimer = null;
let publishScheduled = false;
let needsClaim = false;
let activeClientId = null;
let leaderState = null;

function emptyState(id) {
  return {
    leaderInstanceId: id,
    updatedAt: 0,
    track: null,
    queue: [],
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    announcement: null,
  };
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'INIT':
      handleInit(msg);
      break;
    case 'USER_ACTION':
      handleUserAction(msg, event.source);
      break;
    case 'PLAYBACK_STATE':
      handlePlaybackState(msg);
      break;
    case 'ANNOUNCEMENT':
      handleAnnouncement(msg);
      break;
    case 'REGISTER':
      queueUrl = msg.queueUrl;
      break;
  }
});

async function handleInit(msg) {
  if (userKey && deviceId && queueUrl) {
    broadcastState();
    return;
  }

  userKey = msg.userKey;
  deviceId = 'sw-' + crypto.randomUUID();
  leaderState = emptyState(deviceId);

  if (!(await register())) {
    console.warn('sync: register failed, running unsynced');
    return;
  }

  heartbeatInterval = setInterval(performHeartbeat, HEARTBEAT_MS);
  performHeartbeat();

  positionInterval = setInterval(() => {
    if (activeClientId && leaderState) schedulePublish();
  }, POSITION_TICK_MS);

  pollLoop();
}

async function register() {
  if (!userKey || !deviceId) return false;
  try {
    const res = await fetch(SYNC_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId: deviceId }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    queueUrl = data.queueUrl;
    return true;
  } catch (e) {
    console.warn('sync: register failed', e);
    return false;
  }
}

async function performHeartbeat() {
  if (!userKey || !deviceId) return;
  try {
    const res = await fetch(SYNC_ENDPOINT + '/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId: deviceId }),
    });
    if (!res.ok) return;
    const data = await res.json();

    if (data.stale) { await register(); return; }

    if (activeClientId && data.leaderInstanceId && data.leaderInstanceId !== deviceId) {
      stepDown();
      if (data.state) applyRemoteState(data.state);
    }

    broadcastToAll({
      type: 'HEARTBEAT_RESULT',
      leaderInstanceId: data.leaderInstanceId,
      stale: data.stale,
      state: data.state,
    });
  } catch (e) {
    console.warn('sync: heartbeat failed', e);
  }
}

async function pollLoop() {
  if (!userKey || !deviceId || !queueUrl) return;
  while (!pollAbort && queueUrl) {
    try {
      const res = await fetch(SYNC_ENDPOINT + '/poll/' + userKey + '/' + deviceId);
      if (!res.ok) { await sleep(2000); continue; }
      const data = await res.json();

      if (data.stale) {
        if (!(await register())) await sleep(5000);
        continue;
      }

      for (const msg of (data.messages || [])) {
        if (msg.leaderInstanceId === deviceId) continue;
        if (activeClientId) stepDown();
        applyRemoteState(msg);
      }
    } catch (e) {
      console.warn('sync: poll failed', e);
      await sleep(2000);
    }
  }
}

function handleUserAction(msg, source) {
  if (!leaderState || !deviceId) return;

  if (source && source.id) activeClientId = source.id;
  needsClaim = true;

  if (msg.track !== undefined) leaderState.track = msg.track;
  if (msg.queue !== undefined) leaderState.queue = msg.queue || [];
  if (msg.isPlaying !== undefined) leaderState.isPlaying = msg.isPlaying;

  leaderState.leaderInstanceId = deviceId;
  leaderState.updatedAt = Date.now();

  schedulePublish();

  broadcastToOthers(source, { type: 'MODE', mode: 'follower' });
  if (source) source.postMessage({ type: 'MODE', mode: 'leader' });
}

function handlePlaybackState(msg) {
  if (!leaderState) return;
  leaderState.currentTime = msg.currentTime;
  leaderState.duration = msg.duration;
  leaderState.volume = msg.volume;
  leaderState.muted = msg.muted;
  leaderState.isPlaying = msg.isPlaying;
  schedulePublish();
}

function handleAnnouncement(msg) {
  if (!leaderState || !msg.text) return;
  leaderState.announcement = { text: msg.text, ts: Date.now() };
  schedulePublish();
}

function schedulePublish() {
  if (!queueUrl || publishScheduled) return;
  publishScheduled = true;
  publishTimer = setTimeout(() => {
    publishScheduled = false;
    publish();
  }, PUBLISH_DEBOUNCE_MS);
}

async function publish() {
  if (!activeClientId || !userKey || !deviceId || !leaderState) return;
  const claim = needsClaim;
  needsClaim = false;
  const state = Object.assign({}, leaderState, { leaderInstanceId: deviceId, updatedAt: Date.now() });
  leaderState = state;

  try {
    const res = await fetch(SYNC_ENDPOINT + '/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId: deviceId, state, claim }),
    });
    const data = await res.json();

    if (!data.granted || (data.leaderInstanceId && data.leaderInstanceId !== deviceId)) {
      stepDown();
      broadcastToAll({ type: 'MODE', mode: 'follower' });
      return;
    }

    if (state.announcement && leaderState.announcement && leaderState.announcement.ts === state.announcement.ts) {
      leaderState = Object.assign({}, leaderState, { announcement: null });
    }

    broadcastState();
  } catch (e) {
    console.warn('sync: publish failed', e);
  }
}

function broadcastState() {
  if (!leaderState) return;
  broadcastToAll({ type: 'STATE_UPDATE', state: leaderState });
}

function applyRemoteState(state) {
  leaderState = state;
  broadcastState();
  broadcastToAll({ type: 'MODE', mode: 'follower' });
}

function stepDown() {
  activeClientId = null;
}

async function broadcastToAll(message) {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage(message);
  }
}

async function broadcastToOthers(source, message) {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    if (source && client.id === source.id) continue;
    client.postMessage(message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
