// src/app/shared-utils/sync-sw/sync-service-worker.ts
var SYNC_ENDPOINT = "https://ohb29b452e.execute-api.us-east-1.amazonaws.com/sync";
var HEARTBEAT_MS = 2e4;
var POSITION_TICK_MS = 2e3;
var PUBLISH_DEBOUNCE_MS = 400;
var userKey = null;
var deviceId = null;
var queueUrl = null;
var heartbeatInterval = null;
var positionInterval = null;
var pollAbort = false;
var publishTimer = null;
var publishScheduled = false;
var needsClaim = false;
var activeClientId = null;
var leaderState = null;
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
    announcement: null
  };
}
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case "INIT":
      handleInit(msg);
      break;
    case "USER_ACTION":
      handleUserAction(msg, event.source);
      break;
    case "PLAYBACK_STATE":
      handlePlaybackState(msg);
      break;
    case "ANNOUNCEMENT":
      handleAnnouncement(msg);
      break;
    case "REGISTER":
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
  deviceId = `sw-${crypto.randomUUID()}`;
  leaderState = emptyState(deviceId);
  if (!await register()) {
    console.warn("sync-sw: register failed, running unsynced");
    return;
  }
  heartbeatInterval = setInterval(performHeartbeat, HEARTBEAT_MS);
  performHeartbeat();
  positionInterval = setInterval(() => {
    if (activeClientId && leaderState) {
      schedulePublish();
    }
  }, POSITION_TICK_MS);
  void pollLoop();
}
async function register() {
  if (!userKey || !deviceId) return false;
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userKey, instanceId: deviceId })
    });
    if (!res.ok) return false;
    const data = await res.json();
    queueUrl = data.queueUrl;
    return true;
  } catch (e) {
    console.warn("sync-sw: register failed", e);
    return false;
  }
}
async function performHeartbeat() {
  if (!userKey || !deviceId) return;
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userKey, instanceId: deviceId })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.stale) {
      await register();
      return;
    }
    if (activeClientId && data.leaderInstanceId && data.leaderInstanceId !== deviceId) {
      stepDown();
      if (data.state) applyRemoteState(data.state);
    }
    broadcastToAll({
      type: "HEARTBEAT_RESULT",
      leaderInstanceId: data.leaderInstanceId,
      stale: data.stale,
      state: data.state
    });
  } catch (e) {
    console.warn("sync-sw: heartbeat failed", e);
  }
}
async function pollLoop() {
  if (!userKey || !deviceId || !queueUrl) return;
  while (!pollAbort && queueUrl) {
    try {
      const res = await fetch(`${SYNC_ENDPOINT}/poll/${userKey}/${deviceId}`);
      if (!res.ok) {
        await sleep(2e3);
        continue;
      }
      const data = await res.json();
      if (data.stale) {
        if (!await register()) await sleep(5e3);
        continue;
      }
      for (const msg of data.messages ?? []) {
        if (msg.leaderInstanceId === deviceId) continue;
        if (activeClientId) stepDown();
        applyRemoteState(msg);
      }
    } catch (e) {
      console.warn("sync-sw: poll failed", e);
      await sleep(2e3);
    }
  }
}
function handleUserAction(msg, source) {
  if (!leaderState || !deviceId) return;
  if (source && "id" in source) {
    activeClientId = source.id;
  }
  needsClaim = true;
  if (msg.track !== void 0) leaderState.track = msg.track;
  if (msg.queue !== void 0) leaderState.queue = msg.queue ?? [];
  if (msg.isPlaying !== void 0) leaderState.isPlaying = msg.isPlaying;
  leaderState.leaderInstanceId = deviceId;
  leaderState.updatedAt = Date.now();
  schedulePublish();
  broadcastToOthers(source, { type: "MODE", mode: "follower" });
  if (source) source.postMessage({ type: "MODE", mode: "leader" });
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
    void publish();
  }, PUBLISH_DEBOUNCE_MS);
}
async function publish() {
  if (!activeClientId || !userKey || !deviceId || !leaderState) return;
  const claim = needsClaim;
  needsClaim = false;
  const state = { ...leaderState, leaderInstanceId: deviceId, updatedAt: Date.now() };
  leaderState = state;
  try {
    const res = await fetch(`${SYNC_ENDPOINT}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userKey, instanceId: deviceId, state, claim })
    });
    const data = await res.json();
    if (!data.granted || data.leaderInstanceId && data.leaderInstanceId !== deviceId) {
      stepDown();
      broadcastToAll({ type: "MODE", mode: "follower" });
      return;
    }
    if (state.announcement && leaderState.announcement?.ts === state.announcement.ts) {
      leaderState = { ...leaderState, announcement: null };
    }
    broadcastState();
  } catch (e) {
    console.warn("sync-sw: publish failed", e);
  }
}
function broadcastState() {
  if (!leaderState) return;
  broadcastToAll({ type: "STATE_UPDATE", state: leaderState });
}
function applyRemoteState(state) {
  leaderState = state;
  broadcastState();
  broadcastToAll({ type: "MODE", mode: "follower" });
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
