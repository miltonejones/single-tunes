# SkyTunes

A standalone Angular 21 music-streaming and podcast app — a single-deployable version of the same feature set as the `micro-tunes` micro-frontend project, built without Module or Native Federation.

## Features

- **Music browsing** — browse artists, albums, genres, and playlists in grid or list views
- **Music playback** — play tracks with a persistent audio player, queue management, and Chromecast support
- **Podcasts** — dedicated podcast section with search, subscriptions, categories, and episode playback
- **Search** — global search across the catalog with search history persisted in `localStorage`
- **Text-to-speech announcer** — configurable TTS that speaks between tracks
- **PWA** — installable progressive web app with service worker

## Tech Stack

- **Angular 21** — standalone components, `bootstrapApplication`, lazy-loaded routes via `loadComponent()`
- **TypeScript** — signals throughout for state management
- **Bootstrap 5** — layout grid and utility classes
- **Font Awesome** — icon set
- **Vitest** — unit testing (`@angular/build:unit-test`)
- **Prettier** — 100-char print width, single quotes, Angular HTML parser

## Quick Start

```bash
npm install
npm start            # dev server at http://localhost:4200
```

### Other Commands

| Command | Description |
|---|---|
| `npm run build` | Development build |
| `npm run build:prod` | Production build |
| `npm test` | Run unit tests |
| `npm run restart` | Kill and restart the dev server |

## Routes

| Path | Page |
|---|---|
| `/` | Home |
| `/grid/:type/:page` | Grid (artists, albums, genres, playlists) |
| `/list/:pageNum` | Library |
| `/list/:type/:id/:page` | Detail list (artist, album, genre, playlist) |
| `/search/:query` | Global search |
| `/podcasts` | Podcast home |
| `/podcasts/search/:query` | Podcast search |
| `/podcasts/detail/:feedUrl` | Podcast episode list |
| `/podcasts/subscriptions` | Subscribed podcasts |
| `/podcasts/categories` | Podcasts grouped by genre |

## Architecture

### `shared-utils` path alias

The bare import `shared-utils` maps to `src/app/shared-utils/public-api.ts` via `tsconfig.json`. It's a plain folder, not an npm package — but every HTTP service, domain helper, and shared component that crosses page boundaries is re-exported from `public-api.ts`.

### Query/Command service split

- **`*QueryService`** — read-only HTTP calls (`TrackQueryService`, `CatalogQueryService`, `PodcastQueryService`, etc.)
- **`*CommandService`** — mutations and multi-step orchestration

Pure data transforms live in `shared-utils/domain/*.ts`, keeping services thin.

### Backend

All data comes from API Gateway endpoints configured in `shared-utils/api-config.ts` and `shared-utils/podcast-api-config.ts`. Audio playback URLs are built from a CloudFront/S3 base URL.

### Playback

`AudioPlayer` owns an `<audio>` element and hands off to Chromecast via `CastService` when a Cast session starts. Track changes propagate app-wide through `AudioPlayerCommandService.currentTrack$`. Podcast playback uses a separate `PodcastAudioPlayer` with its own queue.

### UI panel state

Settings, track queue, and audio visualizer panels are each toggled by a small `providedIn: 'root'` service holding a single `signal<boolean>` — no `@Input()`/`@Output()` wiring needed.

## Project Structure

```
src/
├── app/
│   ├── app.ts                  # Root component with toolbar, nav, player dock
│   ├── app.routes.ts           # Route config
│   ├── pages/                  # Music pages (home, list, grid, search)
│   ├── podcast/                # Podcast section (shell, pages, player)
│   ├── shared-utils/           # Shared services, components, domain logic
│   │   ├── public-api.ts       # Barrel export
│   │   ├── domain/             # Pure data transforms
│   │   ├── breadcrumbs.ts      # Breadcrumb component
│   │   ├── podcast-card.ts     # Podcast card component
│   │   └── ...
│   ├── audio-player.ts         # Music audio player
│   ├── audio-visualizer.ts     # Visualizer component
│   ├── track-queue.ts          # Track queue drawer
│   └── settings-modal.ts       # Settings panel
├── main.ts                     # Bootstrap entry point
└── index.html
```
