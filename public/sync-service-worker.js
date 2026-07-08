// src/app/shared-utils/sync-sw/sync-service-worker.ts
var SYNC_ENDPOINT = "https://ohb29b452e.execute-api.us-east-1.amazonaws.com/sync";
var HEARTBEAT_MS = 2e4;
var userKey = null;
var instanceId = null;
var heartbeatInterval = null;
self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || !message.type) return;
  switch (message.type) {
    case "INIT":
      if (heartbeatInterval) break;
      userKey = message.userKey;
      instanceId = message.instanceId;
      heartbeatInterval = setInterval(performHeartbeat, HEARTBEAT_MS);
      performHeartbeat();
      break;
  }
});
async function performHeartbeat() {
  if (!userKey || !instanceId) return;
  try {
    const response = await fetch(`${SYNC_ENDPOINT}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userKey, instanceId })
    });
    if (!response.ok) {
      console.warn("sync-sw: heartbeat returned", response.status);
      return;
    }
    const data = await response.json();
    const allClients = await self.clients.matchAll();
    for (const client of allClients) {
      client.postMessage({
        type: "HEARTBEAT_RESULT",
        leaderInstanceId: data.leaderInstanceId,
        stale: data.stale,
        state: data.state
      });
    }
  } catch (e) {
    console.warn("sync-sw: heartbeat failed", e);
  }
}
