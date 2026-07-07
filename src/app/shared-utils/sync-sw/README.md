# Service Worker Sync Implementation

This directory contains the sync service worker that runs the heartbeat
in the background, independent of any single tab's lifecycle.

## Current Status (2026-07-06)

**Phase 1 complete** — Heartbeat moved to service worker.

The heartbeat POST (every 20s) runs in `sync-service-worker.ts`, compiled
via esbuild to `public/sync-service-worker.js` and served as a standalone
service worker. The client (`SyncClient`) registers the SW, sends INIT
with userKey/instanceId, and forwards heartbeat results to `SyncService`
via a Subject. If SW registration fails, `SyncService` falls back to the
original in-tab `setInterval` heartbeat.

## Structure

```
sync-sw/
├── index.ts                  # Barrel exports
├── sync-service-worker.ts    # SW heartbeat logic (compiled separately)
├── sync-client.ts            # Client-side interface to the SW
├── sync-messages.ts          # Message type definitions
├── sync-storage.ts           # IndexedDB storage (stub — for future phases)
├── sync-strategy.ts          # Retry/backoff strategy (stub — for future phases)
└── sync-sw.spec.ts           # Basic module tests
```

## Build

```bash
npm run build:sw    # Compiles sync-service-worker.ts → public/sync-service-worker.js
```

The output is included in the Angular build as a static asset (served at
`/sync-service-worker.js`).

## Architecture

```
┌─────────────────────┐       postMessage         ┌──────────────────────┐
│  SyncService        │ ◄───────────────────────► │  sync-service-worker │
│  (browser tab)      │   HEARTBEAT_RESULT,        │  (service worker)    │
│                     │   INIT, REGISTER            │                      │
│  - owns mode signal │                             │  - setInterval       │
│  - handles publish  │                             │    heartbeat every   │
│  - handles poll     │                             │    20s               │
│  - fallback: in-tab │                             │  - POST /heartbeat   │
│    heartbeat if no  │                             │  - forward results   │
│    SW available     │                             │    to all clients    │
└─────────────────────┘                             └──────────────────────┘
```

## Future Phases

- **Phase 2**: Move publish (POST /sync/publish) to the SW
- **Phase 3**: Move poll (GET /sync/poll) to the SW (Periodic Background Sync)
- **Phase 4**: Offline queue management via IndexedDB
- **Phase 5**: Network resilience with exponential backoff
