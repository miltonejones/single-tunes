# Shazam Song Recognition — Implementation & Operations Notes

Everything learned while building, testing, and deploying the Shazam feature
(2026-07-05). Original spec: `shazam.md`. Shipped to production via PR #23.

## What it does

A headphones button (`fa-solid fa-headphones`) in the toolbar, left of the
settings gear, opens a modal that:

1. Requests mic access (explicit "Waiting for microphone access…" state — the
   countdown only starts once the browser grants the mic).
2. Records 5 seconds of audio with a pulsing countdown badge.
3. Uploads the clip for recognition and polls until complete.
4. Shows the matched title/artist, or a no-match / error state.
5. **Find on YouTube** hands off to the existing recorder modal via
   `RecorderPanelService.open('Artist - Title', true)` (same pattern as
   `list.ts` `searchYouTubeForTrack`).
6. **Listen again** re-records, 3 seconds longer per retry within a session
   (5s → 8s → 11s → 14s, capped at 15s). Reopening the modal resets to 5s.

## Frontend architecture

All under `src/app/shared-utils/`, exported from `public-api.ts`:

| File | Role |
|---|---|
| `shazam.service.ts` | `recognize(blob)` → job uuid; `waitForResults(uuid)` polls every 3s, max 20 attempts, returns `ShazamTrack \| null` |
| `shazam-panel.service.ts` | `signal<boolean>` open/close state (SettingsPanelService pattern) |
| `shazam-modal.ts/html/css` | Modal component, `@if`-gated in `app.html`; phase state machine `requesting → recording → identifying → result \| no-match \| error` |
| `shazam.service.spec.ts` | Vitest spec (5 tests) using `HttpTestingController` + fake timers |

Mic capture uses `MediaRecorder` with the first supported of
`audio/webm;codecs=opus` / `audio/webm` / `audio/mp4` (Safari). Stream tracks
are stopped as soon as recording ends and on close/destroy; a session counter
discards stale async results when the modal is closed mid-flight.

## Backend

- `lambdas/shazam-proxy/index.mjs` — mounted at `/shazam/*` on the shared AI
  HTTP API. The browser POSTs raw clip bytes to `/shazam/recognize` (API
  Gateway base64-encodes them); the Lambda rewraps them as the multipart
  `file` upload the Shazam API expects and injects the Bearer key from env.
  `/shazam/results/{uuid}` is a straight authenticated pass-through.
- Upstream API: `https://shazam-api.com/api` — `POST /recognize` returns
  `{ uuid, status }`; `POST /results/{uuid}` returns `{ status, results: [{ track:
  { title, subtitle } }] }` where `subtitle` is the artist. Unknown uuids
  report `"processing"` (they never fail), hence the client-side poll cap.
- `SHAZAM_API_ENDPOINT` in `api-config.ts` = `${AI_SEARCH_ENDPOINT}/shazam`.
  **No key ships to the client** (same convention as the recorder proxy).
- Terraform: lambda + integration + two routes + permission in
  `terraform/main.tf`, variables `shazam_api_endpoint` (defaults to the public
  API) and `shazam_api_key` (sensitive, no default — pass via `-var` or a
  gitignored tfvars; the key is NOT committed anywhere).

## Deployment topology (important)

- The AI gateway (`ohb29b452e...`) is **owned by the `staging` Terraform
  workspace** but hardcoded in `api-config.ts`, so BOTH the staging and
  production frontends call it. The shazam-proxy only needs to exist in the
  staging workspace — applying it in a production workspace would create a
  second gateway the app never uses.
- Frontend deploys via `.github/workflows/deploy.yml`: push to `staging` or
  `develop` → staging.music.skytunes.nl; push to `main` → music.skytunes.nl.

### Terraform gotchas (staging workspace)

- **Never plan/apply with default vars**: defaults are production values;
  at minimum pass `-var environment=staging` or shared resources get retagged
  (and worse, per the 2026-07-05 outage, the bucket can be destroyed).
- For additive changes, a `-target`ed plan/apply of just the new resources is
  the safe path: it sidesteps the dangerous defaults AND the required
  `recorder_api_key` (any placeholder works since the recorder Lambda isn't in
  the target graph). Always confirm the plan shows `0 to destroy` and no
  `staging -> production` tag flips before applying.
- The `[@Access2025]` AWS profile in `~/.aws/credentials` works for terraform
  in this workspace.

## Testing

- Unit: `npm test -- --include src/app/shared-utils/shazam.service.spec.ts`
  (note: `--include`, not a positional path — CLAUDE.md was corrected).
- End-to-end without a real mic: launch Chromium with
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream
  --use-file-for-fake-audio-capture=/path/clip.wav` and a wav slice of a real
  song. This genuinely recognizes tracks (verified with "Wesley's Theory" from
  the catalog: download from CloudFront, `ffmpeg -ss 60 -t 30 ... -c:a
  pcm_s16le clip.wav`). Playwright's bundled ffmpeg lacks mp3 support — use
  system `/usr/bin/ffmpeg`.
- `getUserMedia` requires a secure context: works on `http://localhost:4200`,
  fails from a LAN IP over plain HTTP.

## Pitfalls hit along the way

- **Font Awesome 6.4.0 has no `fa-shazam`** brand icon — an invalid FA class
  renders an empty, invisible button. Verify icon classes against the CDN CSS
  before using them (`fa-headphones` and `fa-wave-square` both exist).
- A pending/dismissed mic-permission prompt leaves `getUserMedia` unresolved
  forever — the modal's `requesting` phase exists precisely so this doesn't
  look like a hang.
- API Gateway HTTP API handles CORS preflight itself (`cors_configuration`
  allows `content-type`), so the audio POST needs no extra headers.
