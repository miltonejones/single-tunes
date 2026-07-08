// Service worker for cross-instance sync heartbeat.
// Runs a periodic heartbeat POST to keep the sync session alive and detect
// leadership changes, independent of any single tab's lifecycle.
//
// This file is compiled separately via esbuild (npm run build:sw) and served
// as a standalone service worker at /sync-service-worker.js.

const SYNC_ENDPOINT = 'https://ohb29b452e.execute-api.us-east-1.amazonaws.com/sync';
const HEARTBEAT_MS = 20_000;

let userKey: string | null = null;
let instanceId: string | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// ── Message handler ─────────────────────────────────────────────────────────

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const message = event.data;
  if (!message || !message.type) return;

  switch (message.type) {
    case 'INIT':
      if (heartbeatInterval) break; // already running
      userKey = message.userKey;
      instanceId = message.instanceId;
      heartbeatInterval = setInterval(performHeartbeat, HEARTBEAT_MS);
      // Fire an immediate heartbeat so the client gets a quick first result.
      performHeartbeat();
      break;
  }
});

// ── Heartbeat ───────────────────────────────────────────────────────────────

async function performHeartbeat(): Promise<void> {
  if (!userKey || !instanceId) return;

  try {
    const response = await fetch(`${SYNC_ENDPOINT}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userKey, instanceId }),
    });

    if (!response.ok) {
      console.warn('sync-sw: heartbeat returned', response.status);
      return;
    }

    const data: {
      leaderInstanceId?: string;
      leaseExpires?: number;
      state?: any;
      stale?: boolean;
    } = await response.json();

    // Forward the result to all active client tabs.
    const allClients = await self.clients.matchAll();
    for (const client of allClients) {
      client.postMessage({
        type: 'HEARTBEAT_RESULT',
        leaderInstanceId: data.leaderInstanceId,
        stale: data.stale,
        state: data.state,
      });
    }
  } catch (e) {
    console.warn('sync-sw: heartbeat failed', e);
  }
}

export {}; // Make this a module
