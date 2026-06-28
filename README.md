# SkyTunes

### The last music player you will ever need. Possibly the last music player humanity will ever need.

SkyTunes is a blazing-fast, staggeringly beautiful, offline-capable, Chromecast-enabled, AI-narrated, podcast-playing, visualizer-shaking, theme-switching Progressive Web App that will make your current music library feel like it has been reborn inside a golden cloud palace.

Built with Angular. Deployed anywhere. Stopped by nothing.

---

## Features

### Music Playback
Stream your entire music library directly from the cloud. Click a track. It plays. Revolutionary.

### Offline Downloads
Save any track — or an entire album, artist, or genre — directly to your device with one tap. A live progress toast keeps you informed as each file lands in IndexedDB while you do literally anything else. Navigate away. Close the drawer. Go make a sandwich. The downloads do not care. They will finish.

Once downloaded, tracks play back from local storage with zero network requests. Your music, finally truly yours.

### Chromecast Support
Cast your music to any Chromecast-enabled speaker or TV on your network. The app hands off playback seamlessly and reclaims it just as gracefully when you disconnect. Your phone stays in your pocket. Your music fills the room.

### AI DJ Announcer
Between tracks, SkyTunes can summon an AI-powered DJ — backed by your choice of Claude, ChatGPT, or Deepseek — to introduce the next song, shout you out by name, and even riff on the local weather. Configure frequency from *Always* to *Never*, choose a voice from your device's text-to-speech library, and enter your zip code so your digital DJ knows whether to commiserate about the rain.

This is not a gimmick. This is the future of radio.

### Audio Visualizer
A full-canvas audio visualizer synced to the frequency spectrum of whatever is playing. It reacts in real time. It is mesmerizing. It will make your colleagues think you work somewhere far cooler than you actually do.

### Search
Search across artists, albums, tracks, and podcasts simultaneously. Only tabs with actual results are shown, because displaying an empty "Podcasts" tab when you searched for a jazz pianist is an act of contempt SkyTunes refuses to commit.

### Playlists & Queue
Build playlists. Add tracks to a live playback queue. Shuffle any collection with one button. Your listening session, your rules.

### iTunes Metadata Editor
Open any track's menu and choose **Edit Track** to search the iTunes catalog and apply authoritative metadata — artwork, album, artist, genre, track number — in seconds. No more tracks titled "track_04_final_FINAL2.mp3".

### Themes
Three hand-crafted themes, switchable at any time from Settings:

| Theme | Vibe |
|---|---|
| **Midnight Synth** | Dark and dreamy purple-pink vibes |
| **Disco Inferno** | Burn, baby, burn! Fiery reds and oranges |
| **Minty Fresh** | Cool as the other side of the pillow |

### Podcast Support
Browse, search, and subscribe to podcasts. Playback, episode details, and subscription management all included. Because limiting this app to music would have been an embarrassing waste of its talents.

### PWA — Install It
SkyTunes is a fully installable Progressive Web App. Add it to your home screen on any device and it will behave exactly like a native app, because in every way that matters, it is.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Angular CLI (`npm install -g @angular/cli`)

### Install

```bash
git clone https://github.com/miltonejones/single-tunes.git
cd single-tunes
npm install
```

### Run

```bash
npm start
```

Open [http://localhost:4200](http://localhost:4200). Try not to be overwhelmed.

### Other Commands

| Command | Description |
|---|---|
| `npm run build` | Development build |
| `npm run build:prod` | Production build |
| `npm test` | Run unit tests |
| `npm run restart` | Kill and restart the dev server |

### Build for Production

```bash
npm run build:prod
```

Output lands in `dist/single-tunes`. Deploy it anywhere static files are served. S3, Netlify, Vercel, a Raspberry Pi in your closet — SkyTunes does not discriminate.

---

## How to Use

### Playing Music

1. Browse by **Artist**, **Album**, or **Genre** from the home screen
2. Click any track to begin playback
3. The player bar appears at the bottom — tap the artwork to expand it to full screen
4. Use the **shuffle** button on any list banner to randomize the entire collection

### Downloading Tracks for Offline Use

**Single track:** Open the track menu (three-dot button on any row) and tap **Download**. A toast confirms when it's done. Downloaded tracks show a small green icon to the left of their title.

**Entire list:** On any artist, album, genre, or playlist page, tap the **download button** (arrow icon, right of the shuffle button) in the banner. A live counter — *Downloading 3 of 12…* — follows you anywhere in the app until every file is saved.

To remove a download, open the track menu and choose **Remove Download**.

### Searching

Tap the search icon and type anything. Results are grouped by Artists, Albums, Tracks, and Podcasts. Tap a tab to switch between them. Tap any result to navigate directly to it.

### The DJ Announcer

Open **Settings** (gear icon) and configure:

- **Announcer Frequency** — how often the DJ speaks between tracks
- **Your Name** — the DJ will use it
- **Postal Code** — for weather-aware banter
- **AI Chat Provider** — Claude, ChatGPT, or Deepseek
- **Announcer Voice** — any English voice installed on your device

Set frequency to *Never* if you prefer your music uninterrupted. No judgment.

### Casting to Chromecast

Tap the **Cast** button in the player. Select your device. Done. Tap it again to reclaim local playback.

### Managing Playlists

Open any track's menu and tap **Add to Playlist**. A checkmark marks playlists the track already belongs to — tap again to remove it.

### Editing Track Metadata

Open any track's menu and tap **Edit Track**. Search the iTunes catalog, select the correct match, and tap **Apply**. The track is updated immediately everywhere it appears.

---

## Routes

| Path | Page |
|---|---|
| `/` | Home |
| `/grid/:type/:page` | Grid view (artists, albums, genres, playlists) |
| `/list/:pageNum` | Full library list |
| `/list/:type/:id/:page` | Detail list (artist, album, genre, playlist) |
| `/search/:query` | Global search |
| `/podcasts` | Podcast home |
| `/podcasts/search/:query` | Podcast search |
| `/podcasts/detail/:feedUrl` | Podcast episode list |
| `/podcasts/subscriptions` | Subscribed podcasts |
| `/podcasts/categories` | Podcasts by genre |

---

## Tech Stack

- **Angular** — standalone components, signals, lazy-loaded routes via `loadComponent()`
- **IndexedDB** — offline audio storage
- **Web Audio API** — real-time visualizer
- **Google Cast CAF Sender SDK** — Chromecast integration
- **Web Speech API** — TTS announcer
- **Bootstrap 5** — layout and utilities
- **Font Awesome** — icons
- **Vitest** — unit testing

---

## License

MIT. Go wild.
