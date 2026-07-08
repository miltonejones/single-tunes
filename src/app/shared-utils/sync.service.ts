import { Injectable, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription, firstValueFrom } from 'rxjs';
import { AI_SEARCH_ENDPOINT } from './api-config';
import { AudioPlayerCommandService } from './audio-player-command.service';
import { ITrackItem } from './models';
import { UserService } from './user.service';
import { ToastService } from './toast.service';
import { SyncClient } from './sync-sw/sync-client';

/**
 * Cross-instance playback sync over SQS (routed through the AI gateway).
 *
 * Every browser tab that shares the same `userKey` (derived from the user's
 * first name — see UserService) joins one sync group. Exactly one instance at
 * a time is the **leader**: it owns audible playback and publishes its state.
 * All other instances are **followers**: they mirror the leader's UI (track,
 * queue, play/pause, position, volume, mute, and announcements rendered as
 * silent status text) but emit no sound.
 *
 * Leadership is "newest play wins": any local user action (open track,
 * play/pause, seek) immediately claims leadership; the displaced leader
 * detects via heartbeat/poll that it is no longer leader, mutes its audio,
 * and becomes a follower.
 *
 * Transport: the browser talks to four Lambda routes on the AI HTTP API:
 *   POST /sync/register    — allocate this instance's own SQS queue
 *   POST /sync/heartbeat   — keep the session alive + read current leader
 *   POST /sync/publish     — claim/refresh the lease + fan-out state to peers
 *   GET  /sync/poll/{userKey}/{instanceId} — long-poll this instance's queue
 *
 * SQS messages are consumed-once, so fan-out is one queue *per instance*; the
 * publish Lambda reads the session registry and SendMessages each peer queue.
 */

export type SyncMode = 'idle' | 'leader' | 'follower';

/** Minimal track shape shipped over the wire — enough for followers to render. */
export interface SyncTrack {
  ID?: number;
  Title: string;
  artistName: string;
  albumName: string;
  FileKey: string;
  albumImage: string | null;
  trackTime: any;
}

export interface SyncAnnouncement {
  text: string;
  ts: number;
}

export interface SyncState {
  leaderInstanceId: string;
  updatedAt: number;
  track: SyncTrack | null;
  queue: SyncTrack[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  announcement: SyncAnnouncement | null;
}

const SYNC_ENDPOINT = `${AI_SEARCH_ENDPOINT}/sync`;
const HEARTBEAT_MS = 20_000;
const LEASE_MS = 60_000;
const POSITION_TICK_MS = 2_000;
const PUBLISH_DEBOUNCE_MS = 400;

@Injectable({
  providedIn: 'root',
})
export class SyncService {
  private http = inject(HttpClient);
  private userService = inject(UserService);
  private audioPlayerCommand = inject(AudioPlayerCommandService);
  private toastService = inject(ToastService);
  private syncClient = inject(SyncClient);

  /** Current role of this instance. */
  readonly mode = signal<SyncMode>('idle');
  /** Latest state mirrored from the leader (null when leading/idle). */
  readonly mirrored = signal<SyncState | null>(null);
  /** Silent announcement status text for followers. */
  readonly mirroredAnnouncement = signal<string>('');

  private instanceId = this.userService.instanceId;
  private queueUrl: string | null = null;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private positionTimer?: ReturnType<typeof setInterval>;
  private publishTimer?: ReturnType<typeof setTimeout>;
  private publishScheduled = false;
  private needsClaim = false;
  private pollAbort = false;
  private registering = false;
  /** ts of the newest announcement already toasted — everything older is a rebroadcast. */
  private lastAnnouncementTs = 0;
  private subscriptions: Subscription[] = [];
  private heartbeatSub: Subscription | null = null;
  private isApplyingMirror = false;

  /** Latest leader-side snapshot in memory (driven by AudioPlayer + command service). */
  private leaderState: SyncState = emptyState(this.instanceId);

  constructor() {
    // Start syncing the moment a user identity exists (after the first-run gate).
    effect(() => {
      const user = this.userService.user();
      if (user) {
        void this.start(user.userKey);
      } else {
        this.stop();
      }
    });
  }

  private async start(userKey: string): Promise<void> {
    if (this.queueUrl) return; // already started
    if (!(await this.register(userKey))) {
      console.warn('sync: register failed, running unsynced');
      return;
    }

    // React to local command-service changes so a leader publishes them.
    // Any non-mirror emission is treated as a local user action (leadership
    // takeover), since applyMirroredState sets isApplyingMirror around its own
    // emissions.
    this.subscriptions.push(
      this.audioPlayerCommand.currentTrack$.subscribe((track) => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.leaderState = { ...this.leaderState, track: toSyncTrack(track) };
        if (track) this.schedulePublish();
      }),
      this.audioPlayerCommand.queue$.subscribe((queue) => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.leaderState = {
          ...this.leaderState,
          queue: queue.map(toSyncTrack).filter((t): t is SyncTrack => !!t),
        };
        this.schedulePublish();
      }),
      this.audioPlayerCommand.togglePlayPause$.subscribe(() => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.schedulePublish();
      }),
      this.audioPlayerCommand.seekRelative$.subscribe(() => {
        if (this.isApplyingMirror) return;
        this.onLocalOrigin();
        this.schedulePublish();
      }),
    );

    // Try the service-worker-backed heartbeat first; fall back to in-tab setInterval.
    this.tryStartSwHeartbeat(userKey).then((swOk) => {
      if (!swOk) {
        this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
        void this.heartbeat();
      }
    });

    this.positionTimer = setInterval(() => {
      if (this.mode() === 'leader') this.schedulePublish();
    }, POSITION_TICK_MS);

    void this.pollLoop();
  }

  /**
   * Attempt to start the heartbeat via the sync service worker.
   * Returns true if the SW was registered and INIT sent successfully.
   */
  private async tryStartSwHeartbeat(userKey: string): Promise<boolean> {
    try {
      await this.syncClient.init(userKey, this.instanceId);
      // SW heartbeat is active — subscribe to results.
      this.heartbeatSub = this.syncClient.heartbeatResults.subscribe((result) => {
        this.onSwHeartbeatResult(result);
      });
      return true;
    } catch {
      console.warn('sync: SW heartbeat unavailable, falling back to in-tab');
      return false;
    }
  }

  /** Handle a heartbeat result forwarded from the service worker. */
  private onSwHeartbeatResult(result: { leaderInstanceId?: string; stale?: boolean; state?: SyncState }): void {
    if (result.stale) {
      void this.register(this.userService.user()!.userKey).then((ok) => {
        if (ok && this.queueUrl) this.syncClient.sendRegister(this.queueUrl);
      });
    }
    // If someone else holds the lease and we thought we were leader, stand down.
    if (
      this.mode() === 'leader' &&
      result.leaderInstanceId &&
      result.leaderInstanceId !== this.instanceId
    ) {
      this.stepDown();
      if (result.state) this.applyMirror(result.state);
    }
  }

  /**
   * Allocate (or re-allocate) this instance's SQS queue. Also the recovery
   * path when the backend reports the session `stale` — e.g. after this tab
   * slept past the session TTL and a peer reaped its queue.
   */
  private async register(userKey: string): Promise<boolean> {
    if (this.registering) return false;
    this.registering = true;
    try {
      const reg = await firstValueFrom(
        this.http.post<{ queueUrl: string }>(`${SYNC_ENDPOINT}/register`, {
          userKey,
          instanceId: this.instanceId,
        }),
      );
      this.queueUrl = reg.queueUrl;
      return true;
    } catch (e) {
      console.warn('sync: register failed', e);
      return false;
    } finally {
      this.registering = false;
    }
  }

  private stop(): void {
    clearInterval(this.heartbeatTimer);
    clearInterval(this.positionTimer);
    clearTimeout(this.publishTimer);
    this.heartbeatSub?.unsubscribe();
    this.heartbeatSub = null;
    this.syncClient.destroy();
    this.pollAbort = true;
    for (const s of this.subscriptions) s.unsubscribe();
    this.subscriptions = [];
    this.queueUrl = null;
    this.mode.set('idle');
    this.mirrored.set(null);
    this.mirroredAnnouncement.set('');
  }

  // ── Leadership ───────────────────────────────────────────────────────────

  /**
   * Called by AudioPlayerCommandService on any user-originated action. The
   * newest action wins, so we optimistically become leader immediately and
   * let the displaced leader stand down via heartbeat/poll.
   */
  onLocalOrigin(): void {
    this.needsClaim = true;
    if (this.mode() === 'leader') return;
    this.mode.set('leader');
    this.mirrored.set(null);
  }

  /** True when this instance should render the leader's UI without audio. */
  following(): boolean {
    return this.mode() === 'follower';
  }

  /** AudioPlayer reports mutable playback fields while leading. */
  reportPlayback(partial: Partial<Pick<SyncState, 'isPlaying' | 'currentTime' | 'duration' | 'volume' | 'muted'>>): void {
    if (this.mode() !== 'leader') return;
    this.leaderState = { ...this.leaderState, ...partial };
    this.schedulePublish();
  }

  /** AudioPlayer reports the announcement text it just generated (leader only). */
  reportAnnouncement(text: string): void {
    if (this.mode() !== 'leader' || !text) return;
    this.leaderState = {
      ...this.leaderState,
      announcement: { text, ts: Date.now() },
    };
    this.schedulePublish();
  }

  private schedulePublish(): void {
    if (!this.queueUrl || this.publishScheduled) return;
    this.publishScheduled = true;
    this.publishTimer = setTimeout(() => {
      this.publishScheduled = false;
      void this.publish();
    }, PUBLISH_DEBOUNCE_MS);
  }

  private async publish(): Promise<void> {
    if (this.mode() !== 'leader' || !this.userService.user()) return;
    const claim = this.needsClaim;
    this.needsClaim = false;
    const state: SyncState = { ...this.leaderState, leaderInstanceId: this.instanceId, updatedAt: Date.now() };
    this.leaderState = state;
    try {
      const res = await firstValueFrom(
        this.http.post<{ granted: boolean; leaderInstanceId?: string }>(`${SYNC_ENDPOINT}/publish`, {
          userKey: this.userService.user()!.userKey,
          instanceId: this.instanceId,
          state,
          claim,
        }),
      );
      if (!res.granted || (res.leaderInstanceId && res.leaderInstanceId !== this.instanceId)) {
        this.stepDown();
      }
      // An announcement is a one-shot event: once fanned out, drop it from the
      // leader snapshot so the 2s position tick doesn't rebroadcast it forever.
      // (Guard on ts — a newer announcement may have arrived during the await.)
      if (state.announcement && this.leaderState.announcement?.ts === state.announcement.ts) {
        this.leaderState = { ...this.leaderState, announcement: null };
      }
    } catch (e) {
      // Network blip — stay leader; next publish/heartbeat retries.
      console.warn('sync: publish failed', e);
    }
  }

  private async heartbeat(): Promise<void> {
    const user = this.userService.user();
    if (!user) return;
    try {
      const res = await firstValueFrom(
        this.http.post<{
          leaderInstanceId?: string;
          leaseExpires?: number;
          state?: SyncState;
          stale?: boolean;
        }>(`${SYNC_ENDPOINT}/heartbeat`, { userKey: user.userKey, instanceId: this.instanceId }),
      );
      // Session was reaped while this tab was asleep — get a fresh queue.
      if (res.stale) void this.register(user.userKey);
      // If someone else holds the lease and we thought we were leader, stand down.
      if (
        this.mode() === 'leader' &&
        res.leaderInstanceId &&
        res.leaderInstanceId !== this.instanceId
      ) {
        this.stepDown();
        if (res.state) this.applyMirror(res.state);
      }
    } catch (e) {
      console.warn('sync: heartbeat failed', e);
    }
  }

  private stepDown(): void {
    if (this.mode() === 'follower') return;
    this.mode.set('follower');
    // AudioPlayer reacts to mode() and mutes/releases its audio element.
  }

  // ── Mirror application ───────────────────────────────────────────────────

  private async pollLoop(): Promise<void> {
    const user = this.userService.user();
    if (!user || !this.queueUrl) return;
    while (!this.pollAbort && this.queueUrl) {
      try {
        const res = await firstValueFrom(
          this.http.get<{ messages: SyncState[]; stale?: boolean }>(
            `${SYNC_ENDPOINT}/poll/${user.userKey}/${this.instanceId}`,
          ),
        );
        if (res.stale) {
          // Our queue was reaped (e.g. this tab slept past the session TTL) —
          // re-register for a fresh one; back off if that fails too.
          if (!(await this.register(user.userKey))) await sleep(5000);
          continue;
        }
        for (const msg of res.messages ?? []) {
          if (msg.leaderInstanceId === this.instanceId) continue; // own echo
          if (this.mode() === 'leader') {
            // Newer leader took over — stand down before mirroring.
            this.stepDown();
          }
          this.applyMirror(msg);
        }
      } catch (e) {
        console.warn('sync: poll failed', e);
        await sleep(2000);
      }
    }
  }

  private applyMirror(state: SyncState): void {
    this.isApplyingMirror = true;
    try {
      this.mirrored.set(state);
      this.mode.set('follower');
      if (state.announcement?.text && state.announcement.ts > this.lastAnnouncementTs) {
        // Show announcement as toast on follower instances. Dedup by ts: the
        // same announcement can arrive many times (repeated state publishes,
        // heartbeat lease snapshots, SQS at-least-once delivery).
        this.lastAnnouncementTs = state.announcement.ts;
        this.toastService.show(state.announcement.text);
        this.mirroredAnnouncement.set(state.announcement.text);
      } else if (!state.announcement?.text && this.mirroredAnnouncement()) {
        this.mirroredAnnouncement.set('');
      }
      // Drive the command service so TrackQueue / now-playing render the leader's view.
      this.audioPlayerCommand.applyMirroredState(state);
    } finally {
      this.isApplyingMirror = false;
    }
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function emptyState(instanceId: string): SyncState {
  return {
    leaderInstanceId: instanceId,
    updatedAt: 0,
    track: null,
    queue: [],
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    announcement: null,
  };
}

function toSyncTrack(track: ITrackItem | null): SyncTrack | null {
  if (!track) return null;
  return {
    ID: track.ID,
    Title: track.Title,
    artistName: track.artistName,
    albumName: track.albumName,
    FileKey: track.FileKey,
    albumImage: track.albumImage,
    trackTime: track.trackTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}