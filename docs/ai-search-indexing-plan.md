# Phase 1 AI search indexing for new tracks

## Goal

Trigger AI search indexing automatically whenever the catalog producer creates a new track, without hard-coding any embedding or vector-store vendor into the app and without requiring production credentials for local development.

## Event-driven flow

Phase 1 introduces a dedicated AI API trigger:

1. The catalog writer creates a track and immediately emits a stable `track.created` payload to `POST /track-events`.
2. The `track-index-events` Lambda validates the event, derives a `track.index` job, computes a deterministic idempotency key from `trackId + updatedAt`, and enqueues the job onto a FIFO SQS queue.
3. The `track-index-worker` Lambda consumes the queue asynchronously.
4. The worker fetches the fresh track data from the catalog API, normalizes it into a provider-agnostic search document, and upserts it through an abstract index client.
5. The worker records completion state by idempotency key so repeated deliveries of the same track version are skipped.

### Stable `track.created` payload

```json
{
  "type": "track.created",
  "version": 1,
  "occurredAt": "2026-07-05T23:00:01.000Z",
  "source": "single-tunes",
  "track": {
    "id": "42",
    "createdAt": "2026-07-05T22:59:00.000Z",
    "updatedAt": "2026-07-05T23:00:00.000Z"
  }
}
```

Only the track identity and timestamps are required in the event. The worker re-fetches the canonical track record before building the search document.

## Queue/job model

- **Queue**: FIFO SQS queue with a FIFO dead-letter queue.
- **Job type**: `track.index`
- **Message deduplication**: `MessageDeduplicationId = idempotencyKey`
- **Message group**: track id, so retries for the same track stay ordered.

Example queued job:

```json
{
  "jobType": "track.index",
  "version": 1,
  "enqueuedAt": "2026-07-05T23:00:02.000Z",
  "trackId": "42",
  "createdAt": "2026-07-05T22:59:00.000Z",
  "updatedAt": "2026-07-05T23:00:00.000Z",
  "idempotencyKey": "track.index:9f9e4d35"
}
```

## Idempotency strategy

- The enqueue Lambda derives a deterministic idempotency key from `trackId` and `updatedAt`.
- FIFO queue deduplication suppresses duplicate enqueue attempts inside SQS’s dedup window.
- The worker also writes completion state keyed by the same idempotency key to DynamoDB.
- Replays of the same track version therefore become safe no-ops.

This Phase 1 approach keeps the key stable across retries and future backfills while still allowing a newer `updatedAt` value to enqueue a brand-new job.

## Retry, backoff, and dead-letter handling

- Retryable failures (catalog fetch/network/upsert transport problems) bubble back to SQS via partial batch failure reporting.
- SQS/Lambda handles retry timing automatically through the queue visibility timeout.
- After the configured max receive count, the job moves to the FIFO dead-letter queue.
- Permanent payload/validation failures are logged and not retried.

Operational next step for Phase 2+: alarm on DLQ depth and add a replay tool for dead-lettered jobs.

## Provider-agnostic index upsert plan

The worker does not depend on any specific embedding or vector DB vendor.

- Default mode is `TRACK_INDEX_UPSERT_MODE=stub`, which only logs the normalized document and is safe for dev/test.
- Optional `TRACK_INDEX_UPSERT_MODE=http` allows forwarding `{ operation: "upsert", document }` to any HTTP adapter endpoint later.

This keeps the queue contract and document shape stable even if the backing provider changes.

## Normalized searchable document

Phase 1 builds a normalized text payload from the canonical track record:

- lowercase
- punctuation stripped
- whitespace collapsed
- includes title, artist, album, and genre

The worker currently emits a provider-neutral document with:

- `id`
- `type`
- `version`
- `updatedAt`
- `searchableText`
- `metadata` (catalog fields needed for result hydration)

## Update/delete support plan

Future phases should add:

- `track.updated` → enqueue the same `track.index` job using the new `updatedAt`
- `track.deleted` → enqueue a `track.delete` job that removes or tombstones the document
- scheduled reconciliation to detect catalog/index drift

Phase 1 intentionally scopes implementation to `track.created` plus backfill tooling.

## Observability

Structured logs emitted by the new Lambdas should be enough to start with:

- `track_index_jobs_enqueued`
- `track_index_job_completed`
- `track_index_job_failed`
- `track_index_job_skipped`
- `track_index_upsert_stub`

Recommended CloudWatch metrics/alarms:

- enqueue accepted count
- worker success count
- retryable failure count
- DLQ depth
- indexing latency (`durationMs`)
- duplicate skip count

## Backfill and rollout

### Reindex command

Run the bounded backfill script locally or in CI:

```bash
npm run reindex:tracks
```

Useful environment overrides:

```bash
MAX_TRACKS=100 BATCH_SIZE=25 npm run reindex:tracks
START_PAGE=5 MAX_TRACKS=200 npm run reindex:tracks
AI_SEARCH_ENDPOINT=https://... TUNE_API_ENDPOINT=https://... npm run reindex:tracks
```

If the catalog API does not expose historical timestamps for old records, the script uses a synthetic `REINDEX_TIMESTAMP` fallback so the replay still produces stable Phase 1 events.

### Rollout sequence

1. Deploy the new queue + enqueue endpoint + worker in `stub` mode.
2. Update the catalog producer to call `POST /track-events` after it creates a track.
3. Run a small bounded backfill (`MAX_TRACKS=100`) and confirm worker logs.
4. Run the full backfill.
5. Swap the worker from `stub` mode to a real provider adapter later, without changing the queue contract.

## Current repository scope and assumption

This repository owns the AI API surface and the indexing pipeline skeleton, but not the external catalog-writer service that persists brand-new tracks into the main music catalog. Because of that, Phase 1 exposes the stable `track.created` trigger endpoint here and documents that the catalog producer must invoke it immediately after track creation.
