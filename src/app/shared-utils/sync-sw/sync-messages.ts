// Sync message types and interfaces for tab ↔ service worker communication.

export type SyncMessageType =
  | 'INIT'
  | 'USER_ACTION'
  | 'PLAYBACK_STATE'
  | 'ANNOUNCEMENT'
  | 'STATE_UPDATE'
  | 'MODE'
  | 'HEARTBEAT_RESULT'
  | 'REGISTER';

// ── Tab → SW ─────────────────────────────────────────────────────────────────

/** Sent once per tab to initialise the SW sync engine. */
export interface InitMessage {
  type: 'INIT';
  userKey: string;
  instanceId: string;
}

/** Sent when the user performs a play/pause/skip/track-change action. */
export interface UserActionMessage {
  type: 'USER_ACTION';
  track?: {
    ID?: number;
    Title: string;
    artistName: string;
    albumName: string;
    FileKey: string;
    albumImage: string | null;
    trackTime: any;
  } | null;
  queue?: {
    ID?: number;
    Title: string;
    artistName: string;
    albumName: string;
    FileKey: string;
    albumImage: string | null;
    trackTime: any;
  }[];
  isPlaying?: boolean;
}

/** Periodic position/volume tick from the leader tab. */
export interface PlaybackStateMessage {
  type: 'PLAYBACK_STATE';
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  isPlaying: boolean;
}

/** Announcer just spoke — leader tab forwards the text. */
export interface AnnouncementMessage {
  type: 'ANNOUNCEMENT';
  text: string;
}

// ── SW → Tab ─────────────────────────────────────────────────────────────────

/** Full state snapshot broadcast to all tabs. */
export interface StateUpdateMessage {
  type: 'STATE_UPDATE';
  state: {
    leaderInstanceId: string;
    updatedAt: number;
    track: any;
    queue: any[];
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    announcement: { text: string; ts: number } | null;
  };
}

/** Leadership mode change for a specific tab. */
export interface ModeMessage {
  type: 'MODE';
  mode: 'leader' | 'follower' | 'idle';
}

/** Heartbeat result forwarded from SW to all tabs (existing). */
export interface HeartbeatResultMessage {
  type: 'HEARTBEAT_RESULT';
  leaderInstanceId?: string;
  stale?: boolean;
  state?: any;
}

/** Forward queue URL to SW after re-registration (existing). */
export interface RegisterMessage {
  type: 'REGISTER';
  queueUrl: string;
}

// ── Union ────────────────────────────────────────────────────────────────────

export type SyncMessage =
  | InitMessage
  | UserActionMessage
  | PlaybackStateMessage
  | AnnouncementMessage
  | StateUpdateMessage
  | ModeMessage
  | HeartbeatResultMessage
  | RegisterMessage;
