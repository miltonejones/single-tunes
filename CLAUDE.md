# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm start            # ng serve --host 0.0.0.0 (dev server on :4200)
npm run build        # ng build
npm run build:prod   # ng build --configuration production
npm run restart      # bash stop.sh; bash start.sh — kills then restarts the :4200 dev server
npm test             # ng test (Vitest via @angular/build:unit-test)
```

Run a subset of tests with Vitest's own filters, e.g.:

```bash
npm test -- --include src/app/app.spec.ts
npm test -- -t "should create the app"
```

## Project Identity

This is **SkyTunes** (npm package `single-tunes`) — a standalone, single-deployable Angular app that implements the same music-streaming feature set as the `micro-tunes` micro-frontend project in the sibling directory, but without Module/Native Federation. Routes lazy-load standalone components directly via `loadComponent()` (`src/app/app.routes.ts`); what would be separate remotes in `micro-tunes` (home/list/grid/search) are simply page components under `src/app/pages/`.

## Architecture

### `shared-utils` is a path alias, not a library

`tsconfig.json` maps the bare import `shared-utils` to `./src/app/shared-utils/public-api`. It's a plain folder under `src/app`, not an Nx/npm package — but every HTTP service, domain helper, and shared standalone component/directive that crosses page boundaries is re-exported from `shared-utils/public-api.ts`. Add new cross-page code there and export it from `public-api.ts` rather than importing a file inside `shared-utils/` directly from outside the folder.

### Query/Command service split

Services in `shared-utils` are paired by responsibility rather than by entity:

- `*QueryService` — read-only HTTP calls (`TrackQueryService`, `CatalogQueryService`, `AnnouncementQueryService`, `WikipediaQueryService`)
- `*CommandService` — mutations and multi-step orchestration (e.g. `TrackCommandService.applyAppleLookupResult` merges iTunes metadata, resolves/creates album and artist records, then persists the track)

Pure data transforms live separately in `shared-utils/domain/*.ts` (`track.ts`, `text.ts`, `announcement.ts`, `listing.ts`), keeping the services themselves as thin HTTP wrappers around that logic.

### Backend

All data comes from API Gateway endpoints hardcoded in `shared-utils/api-config.ts` (`TUNE_API_ENDPOINT`, `ANNOUNCE_ENDPOINT`, `PHOTO_ENDPOINT`, `WIKIMEDIA_SEARCH_ENDPOINT`), plus a CloudFront/S3 base URL (`CLOUD_FRONT_URL`) used by `buildPlayerUrl()` (`domain/track.ts`) to build playable audio URLs.

### Playback has two targets: local `<audio>` and Chromecast

`AudioPlayer` (`src/app/audio-player.ts`) owns an `<audio>` element and also subscribes to `CastService.isConnected$` to hand off/reclaim playback whenever a Cast session starts or ends. `CastService` (`shared-utils/cast.service.ts`) wraps the Google Cast CAF Sender SDK, which is loaded externally at runtime rather than via npm — see the ambient `declare namespace cast.framework` / `chrome.cast.media` blocks at the top of that file — and it degrades to "unavailable" if the SDK script never loads. Track changes propagate app-wide through `AudioPlayerCommandService.currentTrack$`.

### Announcer (text-to-speech between tracks)

`AnnouncementQueryService` / `AnnouncementCommandService` plus `SpeechPlaybackService` drive a TTS "announcer" that speaks between tracks. `AudioPlayer` ducks playback to `ANNOUNCING_VOLUME` while the announcer talks and restores the prior volume afterward. Announcer behavior (name, zip, chat style) is user-configurable via `AnnouncerSettingsService`, persisted to `localStorage` under `sky-tunes-announcer-settings`.

### UI panel state via small signal services

The settings modal, track queue drawer, and audio visualizer are each toggled by a tiny `providedIn: 'root'` service holding a single `signal<boolean>` (`SettingsPanelService`, `TrackQueuePanelService`, `AudioVisualizerPanelService`) rather than component `@Input()`/`@Output()` wiring — any component can `inject()` the relevant panel service to open or close it.

### PWA

`public/manifest.json` + `public/sw.js` + `ServiceWorkerUpdateService` (registered in `main.ts` after bootstrap) make this an installable PWA. `start.sh` / `stop.sh` bind and kill the dev server on `0.0.0.0:4200` (`stop.sh` uses `lsof -ti tcp:4200`).

## Key Conventions

- **Prettier**: 100 char print width, single quotes, Angular HTML parser (see `prettier` key in `package.json`)
- **Standalone components only**, no NgModules — bootstrapped via `bootstrapApplication` (`main.ts`); routes lazy-load page components with `loadComponent()`
- **Testing**: Vitest (`@angular/build:unit-test`), not Karma/Jasmine
