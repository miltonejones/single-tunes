// Service worker for cross-instance playback sync.
//
// Runs register, heartbeat, poll, and publish in the SW so there is ONE
// SQS queue, ONE poll loop, and ONE heartbeat per device — not per tab.
// Tabs communicate with the SW via postMessage; cross-tab state changes
// are instant (no SQS round-trip).
//
// Compiled separately via esbuild (npm run build:sw) and served as
// /sync-service-worker.js.

const SYNC_ENDPOINT = 'https://ohb29b452e.execute-api.us-east-1.amazonaws.com/sync';
const HEARTBEAT_MS = 20_000;
const POSITION_TICK_MS = 2_000;
const PUBLISH_DEBOUNCE_MS = 400;

// ── Device-level state ───────────────────────────────────────────────────────

let userKey: string | null = null;
let deviceId: string | null = null; // SW's own identity (one per device)
let queueUrl: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let positionInterval: ReturnType<typeof setInterval> | null = null;
let pollAbort = false;
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let publishScheduled = false;
let needsClaim = false;

/** Which local tab currently owns audible playback. */
let activeClientId: string | null = null;

/** Latest leader-side state snapshot. */
let leaderState: SyncState | null = null;

interface SyncTrack {
  ID?: number;
  Title: string;
  artistName: string;
  albumName: string;
  FileKey: string;
  albumImage: string | null;
  trackTime: any;
}

interface SyncState {
  leaderInstanceId: string;
  updatedAt: number;
  track: SyncTrack | null;
  queue: SyncTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  announcement: { text: string; ts: number } | null;
}

function emptyState(id: string): SyncState {
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

// ── Message handler ──────────────────────────────────────────────────────────

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'INIT':
      handleInit(msg);
      break;
    case 'USER_ACTION':
      handleUserAction(msg, event.source as Client | null);
      break;
    case 'PLAYBACK_STATE':
      handlePlaybackState(msg);
      break;
    case 'ANNOUNCEMENT':
      handleAnnouncement(msg);
      break;
    case 'REGISTER':
      // Tab re-registered its own queue — forward the new URL.
      // (Only used as fallback when SW-based sync is unavailable.)
      queueUrl = msg.queueUrl;
      break;
  }
});

// ── INIT ─────────────────────────────────────────────────────────────────────

async function handleInit(msg: { userKey: string; instanceId: string }): Promise<void> {
  // Already initialised — just broadcast current state to the new tab.
  if (userKey && deviceId && queueUrl) {
    broadcastState();
    return;
  }

  userKey = msg.userKey;
  deviceId = `sw-${crypto.randomUUID()}`;
  leaderState = emptyState(deviceId);

  if (!(await register())) {
    console.warn('sync-sw: register failed, running unsynced');
    return;
  }

  // Heartbeat
  heartbeatInterval = setInterval(performHeartbeat, HEARTBEAT_MS);
  performHeartbeat();

  // Position tick (publishes currentTime while leading)
  positionInterval = setInterval(() => {
    if (activeClientId && leaderState) {
      schedulePublish();
    }
  }, POSITION_TICK_MS);

  // Poll loop
  void pollLoop();
}

// ── Register ─────────────────────────────────────────────────────────────────

async function register(): Promise<boolean> {
  if (!userKey || !deviceId) return false;
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId: deviceId }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    queueUrl = data.queueUrl;
    return true;
  } catch (e) {
    console.warn('sync-sw: register failed', e);
    return false;
  }
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

async function performHeartbeat(): Promise<void> {
  if (!userKey || !deviceId) return;
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId: deviceId }),
    });
    if (!res.ok) return;
    const data: { leaderInstanceId?: string; stale?: boolean; state?: SyncState } = await res.json();

    if (data.stale) {
      await register();
      return;
    }

    // Another device holds the lease — stand down local leader.
    if (
      activeClientId &&
      data.leaderInstanceId &&
      data.leaderInstanceId !== deviceId
    ) {
      stepDown();
      if (data.state) applyRemoteState(data.state);
    }

    // Forward to all tabs so SyncService can react.
    broadcastToAll({
      type: 'HEARTBEAT_RESULT',
      leaderInstanceId: data.leaderInstanceId,
      stale: data.stale,
      state: data.state,
    });
  } catch (e) {
    console.warn('sync-sw: heartbeat failed', e);
  }
}

// ── Poll ─────────────────────────────────────────────────────────────────────

async function pollLoop(): Promise<void> {
  if (!userKey || !deviceId || !queueUrl) return;
  while (!pollAbort && queueUrl) {
    try {
      const res = await fetch(`${SYNC_ENDPOINT}/poll/${userKey}/${deviceId}`);
      if (!res.ok) { await sleep(2000); continue; }
      const data: { messages: SyncState[]; stale?: boolean } = await res.json();

      if (data.stale) {
        if (!(await register())) await sleep(5000);
        continue;
      }

      for (const msg of data.messages ?? []) {
        if (msg.leaderInstanceId === deviceId) continue; // own echo
        if (activeClientId) stepDown();
        applyRemoteState(msg);
      }
    } catch (e) {
      console.warn('sync-sw: poll failed', e);
      await sleep(2000);
    }
  }
}

// ── Tab → SW: User action ────────────────────────────────────────────────────

function handleUserAction(
  msg: { track?: any; queue?: any[]; isPlaying?: boolean },
  source: Client | null,
): void {
  if (!leaderState || !deviceId) return;

  // This tab becomes the active leader.
  if (source && 'id' in source) {
    activeClientId = (source as any).id;
  }

  needsClaim = true;

  if (msg.track !== undefined) leaderState.track = msg.track;
  if (msg.queue !== undefined) leaderState.queue = msg.queue ?? [];
  if (msg.isPlaying !== undefined) leaderState.isPlaying = msg.isPlaying;

  leaderState.leaderInstanceId = deviceId;
  leaderState.updatedAt = Date.now();

  schedulePublish();

  // Broadcast to all OTHER tabs that they're followers.
  broadcastToOthers(source, { type: 'MODE', mode: 'follower' });
  // Tell the acting tab it's leader.
  if (source) source.postMessage({ type: 'MODE', mode: 'leader' });
}

// ── Tab → SW: Playback state tick ────────────────────────────────────────────

function handlePlaybackState(msg: {
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  isPlaying: boolean;
}): void {
  if (!leaderState) return;
  leaderState.currentTime = msg.currentTime;
  leaderState.duration = msg.duration;
  leaderState.volume = msg.volume;
  leaderState.muted = msg.muted;
  leaderState.isPlaying = msg.isPlaying;
  schedulePublish();
}

// ── Tab → SW: Announcement ──────────────────────────────────────────────────

function handleAnnouncement(msg: { text: string }): void {
  if (!leaderState || !msg.text) return;
  leaderState.announcement = { text: msg.text, ts: Date.now() };
  schedulePublish();
}

// ── Publish ──────────────────────────────────────────────────────────────────

function schedulePublish(): void {
  if (!queueUrl || publishScheduled) return;
  publishScheduled = true;
  publishTimer = setTimeout(() => {
    publishScheduled = false;
    void publish();
  }, PUBLISH_DEBOUNCE_MS);
}

async function publish(): Promise<void> {
  if (!activeClientId || !userKey || !deviceId || !leaderState) return;
  const claim = needsClaim;
  needsClaim = false;
  const state: SyncState = { ...leaderState, leaderInstanceId: deviceId, updatedAt: Date.now() };
  leaderState = state;

  try {
    const res = await fetch(`${SYNC_ENDPOINT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId: deviceId, state, claim }),
    });
    const data: { granted: boolean; leaderInstanceId?: string } = await res.json();

    if (!data.granted || (data.leaderInstanceId && data.leaderInstanceId !== deviceId)) {
      stepDown();
      broadcastToAll({ type: 'MODE', mode: 'follower' });
      return;
    }

    // Drop one-shot announcement after fan-out.
    if (state.announcement && leaderState.announcement?.ts === state.announcement.ts) {
      leaderState = { ...leaderState, announcement: null };
    }

    // Broadcast updated state to all local tabs.
    broadcastState();
  } catch (e) {
    console.warn('sync-sw: publish failed', e);
  }
}

// ── State broadcast ──────────────────────────────────────────────────────────

function broadcastState(): void {
  if (!leaderState) return;
  broadcastToAll({ type: 'STATE_UPDATE', state: leaderState });
}

function applyRemoteState(state: SyncState): void {
  leaderState = state;
  broadcastState();
  broadcastToAll({ type: 'MODE', mode: 'follower' });
}

function stepDown(): void {
  activeClientId = null;
}

// ── Client communication ─────────────────────────────────────────────────────

async function broadcastToAll(message: any): Promise<void> {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage(message);
  }
}

async function broadcastToOthers(source: Client | null, message: any): Promise<void> {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    if (source && client.id === (source as any).id) continue;
    client.postMessage(message);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export {}; // Make this a module
