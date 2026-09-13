/**
 * Audio post playback — the corner player's engine
 * =================================================
 * An audio post plays inside its card, and the card owns the native player:
 * it preloads, seeks, meters and unloads with the card. That is the right
 * shape for a feed, and it also means the track dies the moment the card
 * scrolls out of view — there was no way to keep listening while you browse,
 * which the radio and stage recordings have had for a while.
 *
 * This module is where a track goes when it is popped out. The card hands its
 * loaded player over as-is (no second download, no gap in the audio), this
 * takes the audio focus and the lock screen under its own name, and
 * `AudioPostMiniPlayer` — mounted once, app-wide, beside `RadioMiniPlayer` —
 * keeps it reachable and stoppable from anywhere. A card that is still on
 * screen mirrors the state published here rather than running a second copy
 * of the same track, and pressing its pop-out control again takes the player
 * back, still playing.
 *
 * Module scope rather than a context for the same reason radio and stages
 * are: the cards live in long lists, the mini player lives outside every
 * navigator, and there is only ever one of these at a time.
 *
 * @module libs/audio-post-playback
 */

import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import type { EventSubscription } from "expo-modules-core";
import { useEffect, useState } from "react";

import { releaseAudioFocus, requestAudioFocus } from "./audioFocus";
import { configureForBackgroundPlayback } from "./audioSession";
import { claimLockScreen, releaseLockScreen, type LockScreenTrack } from "./lockScreen";
import { createLogger } from "./logger";
import { stopActivePreview } from "./previewRegistry";

const log = createLogger("audio-post-playback");

/** This module's identity in the single-owner lock screen slot. */
const LOCK_SCREEN_ID = "audio-post-popout";

/** A finite file with a real seek map: the skip buttons do something. */
const LOCK_SCREEN_CONTROLS = { showSeekForward: true, showSeekBackward: true };

/** Status ticks inside this window after a seek still report the old position. */
const SEEK_SETTLE_MS = 600;

/**
 * How many consecutive status ticks may disagree with the published play
 * state before it is corrected. The lock screen pauses the native player
 * without going through here, so `status.playing` has to be believed — but a
 * player reports not-playing while it buffers, so a single sample means
 * nothing. Ticks are 100ms apart; four of them is the same 400ms the stage
 * engine settled on.
 */
const PLAYING_DISAGREE_SAMPLES = 4;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export interface AudioPostTrack {
  tokenId: string;
  audioUrl: string;
  /** Already resolved by the card: a post with no title still needs a name. */
  title: string;
  artist: string;
  artworkUrl?: string;
}

export interface AudioPostPlaybackState {
  /** The popped-out post, or null when the corner player is closed. */
  tokenId: string | null;
  track: AudioPostTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Playhead, 0–1. */
  progress: number;
  /** Seconds. */
  currentTime: number;
  duration: number;
  volume: number;
}

const IDLE: AudioPostPlaybackState = {
  tokenId: null,
  track: null,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
  volume: 1,
};

let state: AudioPostPlaybackState = IDLE;
const subscribers = new Set<(next: AudioPostPlaybackState) => void>();

function publish(patch: Partial<AudioPostPlaybackState>) {
  const next = { ...state, ...patch };
  let changed = false;
  for (const key of Object.keys(next) as (keyof AudioPostPlaybackState)[]) {
    if (next[key] !== state[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = next;
  for (const notify of subscribers) notify(state);
}

let player: AudioPlayer | null = null;
let statusSub: EventSubscription | null = null;
let lastSeekAt = 0;
/** A seek asked for before the track had a duration to seek within. */
let pendingSeek: number | null = null;
let playingDisagreements = 0;

/** What the OS shows on the lock screen for `track`. */
function lockScreenTrack(track: AudioPostTrack): LockScreenTrack {
  return {
    title: track.title,
    artist: track.artist,
    albumTitle: "DeHub • Audio",
    artworkUrl: track.artworkUrl || undefined,
  };
}

function claim(p: AudioPlayer, track: AudioPostTrack) {
  claimLockScreen(LOCK_SCREEN_ID, p, lockScreenTrack(track), LOCK_SCREEN_CONTROLS);
}

function applyPendingSeek(p: AudioPlayer) {
  if (pendingSeek === null) return;
  if (!p.isLoaded || !(p.duration > 0)) return;
  const ratio = pendingSeek;
  pendingSeek = null;
  lastSeekAt = Date.now();
  p.seekTo(ratio * p.duration).catch(() => {});
}

function onStatus(status: AudioStatus) {
  if (!state.tokenId || !player) return;
  if (!status.isLoaded) return;

  const patch: Partial<AudioPostPlaybackState> = {};
  if (state.isLoading) patch.isLoading = false;
  if (status.duration > 0) {
    patch.duration = status.duration;
    applyPendingSeek(player);
  }

  if (status.didJustFinish) {
    // Rest at the end rather than closing: one tap on the corner player
    // starts it again from the top, which is what a finished track wants.
    patch.isPlaying = false;
    patch.progress = 1;
    patch.currentTime = status.duration;
    playingDisagreements = 0;
    releaseAudioFocus(stopAudioPost);
    publish(patch);
    return;
  }

  if (status.duration > 0 && Date.now() - lastSeekAt > SEEK_SETTLE_MS) {
    patch.currentTime = status.currentTime;
    patch.progress = clamp01(status.currentTime / status.duration);
  }

  if (status.playing !== state.isPlaying) {
    playingDisagreements += 1;
    if (playingDisagreements >= PLAYING_DISAGREE_SAMPLES) {
      patch.isPlaying = status.playing;
      playingDisagreements = 0;
    }
  } else {
    playingDisagreements = 0;
  }

  publish(patch);
}

function attach(p: AudioPlayer) {
  detach();
  statusSub = p.addListener("playbackStatusUpdate", onStatus);
}

function detach() {
  statusSub?.remove();
  statusSub = null;
}

/** Stop the track, drop the player and close the corner player. */
export function stopAudioPost() {
  detach();
  if (player) {
    try {
      player.pause();
    } catch {}
    try {
      player.remove();
    } catch {}
    player = null;
  }
  pendingSeek = null;
  playingDisagreements = 0;
  releaseLockScreen(LOCK_SCREEN_ID);
  releaseAudioFocus(stopAudioPost);
  publish(IDLE);
}

export interface AudioPostHandover {
  track: AudioPostTrack;
  /**
   * The card's player, loaded or still loading, or null when the card never
   * got as far as creating one — the engine makes its own then.
   */
  player: AudioPlayer | null;
  /** 0–1. */
  volume: number;
  /**
   * Where to start, 0–1, for a player that has not loaded yet. A loaded
   * player already sits at its own position and this is ignored.
   */
  startAt?: number | null;
}

/**
 * Pop a post out into the corner player, starting it if it is not already
 * playing — the only reading of the control that makes sense from a card
 * nobody has pressed play on.
 *
 * The card must have given up its own references to `player` before calling:
 * from here on this module pauses, seeks and removes it.
 */
export function popOutAudioPost(handover: AudioPostHandover) {
  const { track } = handover;

  if (state.tokenId === track.tokenId && player) {
    // Already here: make sure it is audible and leave it at that.
    if (!state.isPlaying) resumeAudioPost();
    return;
  }

  // Whatever was popped out before is over; this is not a queue.
  detach();
  if (player) {
    try {
      player.pause();
    } catch {}
    try {
      player.remove();
    } catch {}
    player = null;
  }

  requestAudioFocus(stopAudioPost);
  stopActivePreview();

  let p = handover.player;
  if (!p) {
    try {
      p = createAudioPlayer({ uri: track.audioUrl }, { updateInterval: 100 });
    } catch (e) {
      log.error("Could not create the player", e);
      stopAudioPost();
      return;
    }
  }
  const volume = clamp01(handover.volume);
  p.volume = volume;
  player = p;
  playingDisagreements = 0;
  attach(p);

  const loaded = p.isLoaded && p.duration > 0;
  // A loaded player sits at its own position; one still loading (handed over
  // or created just now) takes the card's remembered position once it can.
  pendingSeek = !loaded && handover.startAt != null ? clamp01(handover.startAt) : null;
  const startRatio = loaded ? clamp01(p.currentTime / p.duration) : (pendingSeek ?? 0);
  publish({
    tokenId: track.tokenId,
    track,
    volume,
    isLoading: !loaded,
    isPlaying: true,
    duration: loaded ? p.duration : 0,
    currentTime: loaded ? p.currentTime : 0,
    progress: startRatio,
  });

  void (async () => {
    try {
      // A deliberate press: the track is meant to survive the screen locking.
      await configureForBackgroundPlayback();
      if (player !== p) return; // stopped or replaced while the session was configuring
      if (loaded && p.currentTime >= p.duration - 0.05) {
        lastSeekAt = Date.now();
        await p.seekTo(0);
      }
      p.play();
      claim(p, track);
    } catch (e) {
      log.error("Could not start the popped-out post", e);
      if (player === p) stopAudioPost();
    }
  })();
}

/**
 * Hand the player back to a card, still playing if it was. Returns null when
 * nothing is popped out for that post, in which case nothing changed.
 *
 * The card takes over the audio focus and the lock screen with its own ids;
 * the engine's claims are released so a stale release from here later cannot
 * touch the card's.
 */
export function takeBackAudioPost(tokenId: string): AudioPlayer | null {
  if (state.tokenId !== tokenId || !player) return null;
  const p = player;
  detach();
  player = null;
  pendingSeek = null;
  playingDisagreements = 0;
  // Ownership of the lock screen moves with the player: clearing it here
  // would blank the notification for the instant before the card re-claims.
  // The card's claim replaces this one, and the module's own release becomes
  // a no-op the moment it does.
  releaseAudioFocus(stopAudioPost);
  publish(IDLE);
  return p;
}

/** Pause. The lock screen claim is kept so the track can be resumed from it. */
export function pauseAudioPost() {
  if (!player || !state.tokenId) return;
  try {
    player.pause();
  } catch (e) {
    log.warn("Pause failed", e);
  }
  playingDisagreements = 0;
  releaseAudioFocus(stopAudioPost);
  publish({ isPlaying: false });
}

export function resumeAudioPost() {
  const p = player;
  const { track } = state;
  if (!p || !track) return;
  requestAudioFocus(stopAudioPost);
  stopActivePreview();
  playingDisagreements = 0;
  void (async () => {
    try {
      await configureForBackgroundPlayback();
      if (player !== p) return;
      if (p.isLoaded && p.duration > 0 && p.currentTime >= p.duration - 0.05) {
        lastSeekAt = Date.now();
        await p.seekTo(0);
        publish({ progress: 0, currentTime: 0 });
      }
      p.play();
      // Re-claimed on resume: something else may have taken the slot while
      // this sat paused.
      claim(p, track);
    } catch (e) {
      log.warn("Resume failed", e);
    }
  })();
  publish({ isPlaying: true });
}

export function toggleAudioPost() {
  if (!state.tokenId) return;
  if (state.isPlaying) pauseAudioPost();
  else resumeAudioPost();
}

/** Jump to `ratio` (0–1). Never changes the play state. */
export function seekAudioPost(ratio: number) {
  if (!state.tokenId) return;
  const clamped = clamp01(ratio);
  lastSeekAt = Date.now();
  publish({ progress: clamped, currentTime: clamped * state.duration });
  const p = player;
  if (!p || !p.isLoaded || !(p.duration > 0)) {
    pendingSeek = clamped;
    return;
  }
  p.seekTo(clamped * p.duration).catch((e) => log.warn("Seek failed", e));
}

/** 0–1. */
export function setAudioPostVolume(level: number) {
  const volume = clamp01(level);
  if (player) player.volume = volume;
  publish({ volume });
}

/** Subscribe to the popped-out post. */
export function useAudioPostPlayback(): AudioPostPlaybackState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

/** The current state, for code that is not a component. */
export function getAudioPostPlaybackState(): AudioPostPlaybackState {
  return state;
}
