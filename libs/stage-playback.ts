/**
 * Stage recording playback
 * ========================
 * One engine for every place a stage recording plays: the Recorded list in the
 * Stages modal, the transcript sheet, and the stage card in the feed. They used
 * to be two separate implementations of the same awkward job (and the feed card
 * had none at all), which is why only one of them had a scrub bar, why leaving
 * a surface killed the audio, and why the times were wrong everywhere.
 *
 * This is a port of web's `src/lib/stage-playback.ts` — same state shape, same
 * verbs, same duration resolution — so the two apps behave identically.
 *
 * One module-scope `AudioPlayer`, not a hook. A feed can mount dozens of play
 * buttons and two recordings talking over each other is never what was wanted:
 * pressing play anywhere stops whatever else was playing, and every mounted
 * control subscribes to the same state so they all agree.
 *
 * Pressing play twice pauses, it does not stop. Stopping is a separate verb
 * with one button behind it (the corner player's X) because it drops the
 * source and the position with it.
 *
 * ── The duration problem, which shapes most of this file ──
 *
 * Web records stages with MediaRecorder, and Chrome writes a WebM whose Segment
 * has an unknown size, whose Info carries **no Duration element at all**, and
 * which has no Cues index. Verified against the one recording in the bucket:
 * `ffprobe` reports `duration=N/A` for a 25-minute file. ExoPlayer therefore
 * reports `duration: 0` and builds an *unseekable* SeekMap — which is exactly
 * why the Recorded list showed `0:00 / 0:00` with a dead slider.
 *
 * So duration is resolved in priority order: the player's own value once it is
 * not obviously wrong, then the stage's `started_at`/`ended_at` span. And
 * `seekable` is published separately — a source that never reports a duration
 * cannot be scrubbed on Android, and a bar that pretends otherwise is worse
 * than one that says so.
 *
 * @module libs/stage-playback
 */

import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import { useEffect, useState } from "react";

import { configureForPlayback } from "./audioSession";
import { createLogger } from "./logger";
import { storage } from "./storage";
import { toastError, toastInfo } from "./toast";
import { supabase } from "../services/supabase";

const log = createLogger("stage-playback");

/** The little a recording needs to be playable. Any AudioSpace satisfies it. */
export interface StagePlayable {
  id: string;
  title?: string | null;
  recording_url?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface StagePlaybackState {
  /** Stage whose recording is loaded, or null when nothing is playing. */
  spaceId: string | null;
  title: string;
  loading: boolean;
  /**
   * Loaded and held. A paused recording keeps its position, its place in the
   * corner player and its lit control — only stopping clears those.
   */
  paused: boolean;
  /**
   * Whether the corner player is up. Opened by hand from the pop-out control
   * beside play, never by playback starting.
   */
  popout: boolean;
  /** 0–1, quantized to 0.1% so identical values bail out of React. */
  progress: number;
  /** Playhead in seconds — the transcript sheet follows along on this. */
  position: number;
  /** Resolved duration in seconds. 0 while unknown. */
  duration: number;
  /**
   * Whether this source can actually be scrubbed. False for the container web
   * records into (see the note at the top) — the UI drops the drag rather than
   * offering a bar that silently ignores it.
   */
  seekable: boolean;
  /** Formatted remaining time, e.g. "-3:21". Empty when unknown. */
  timeLeft: string;
  /**
   * Playback speed, shared by every surface and persisted between sessions —
   * a town hall listened at 2x from the Recorded list is still 2x in the
   * corner player. Mirrors web's lib/stage-playback rate.
   */
  rate: number;
}

/** Same ladder the video players cycle through, on both platforms. */
export const STAGE_PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

const RATE_KEY = "stage-recording-rate";

function readStoredRate(): number {
  try {
    const n = Number(storage.getString(RATE_KEY));
    if (STAGE_PLAYBACK_RATES.includes(n as (typeof STAGE_PLAYBACK_RATES)[number])) return n;
  } catch {}
  return 1;
}

const IDLE: StagePlaybackState = {
  spaceId: null,
  title: "",
  loading: false,
  paused: false,
  popout: false,
  progress: 0,
  position: 0,
  duration: 0,
  seekable: false,
  timeLeft: "",
  rate: readStoredRate(),
};

let state: StagePlaybackState = IDLE;
const subscribers = new Set<(next: StagePlaybackState) => void>();

/** Set the playback speed for stage recordings, now and for future plays. */
export function setStageRecordingRate(rate: number) {
  publish({ rate });
  try {
    storage.set(RATE_KEY, rate);
  } catch {}
  const p = player;
  if (p) {
    try {
      // Pitch stays corrected, so voices stay natural at 2x.
      p.shouldCorrectPitch = true;
      p.setPlaybackRate(rate);
    } catch (e) {
      log.warn("setPlaybackRate failed", e);
    }
  }
}

/** Step through STAGE_PLAYBACK_RATES and land on the new rate. */
export function cycleStageRecordingRate(): number {
  const idx = STAGE_PLAYBACK_RATES.indexOf(state.rate as (typeof STAGE_PLAYBACK_RATES)[number]);
  const next = STAGE_PLAYBACK_RATES[(idx + 1) % STAGE_PLAYBACK_RATES.length];
  setStageRecordingRate(next);
  return next;
}

function publish(patch: Partial<StagePlaybackState>) {
  const next = { ...state, ...patch };
  // Every field compared, and a no-op patch costs nothing: status updates
  // arrive several times a second, so identical values have to bail before
  // React sees them. Written as a loop rather than a chain of &&s because a
  // field added to the state and forgotten here would republish the world.
  let changed = false;
  for (const key of Object.keys(next) as (keyof StagePlaybackState)[]) {
    if (next[key] !== state[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = next;
  for (const notify of subscribers) notify(state);
}

// ── The player ──────────────────────────────────────────────────────────────
//
// Created once and reused for the app's lifetime. `replace()` swaps the source;
// there is no separate unload step, and no per-row player to leak.

let player: AudioPlayer | null = null;

/** Seconds derived from started_at/ended_at — the fallback duration. */
let estimatedDuration = 0;
/** The player's own duration once it has reported a believable one. */
let realDuration = 0;
/** A scrub that arrived before a duration was known, applied once one is. */
let pendingSeekRatio: number | null = null;
/** Where the last seek was aimed, in seconds, and when it was issued. */
let seekTarget: { seconds: number; at: number } | null = null;
let endTimeout: ReturnType<typeof setTimeout> | null = null;
/** Guards `didJustFinish` firing again while the end animation runs. */
let ending = false;

/**
 * Status updates every 200ms. The waveform is 90 bars wide, so even a
 * two-minute recording only advances a bar every 1.3s — the interval is about
 * the time readout, not the fill.
 */
const UPDATE_INTERVAL_MS = 200;

/**
 * How long a seek gets to land before the source is written off as unseekable.
 * ExoPlayer ignores `seekTo` outright on a container with no index, so nothing
 * is thrown and nothing moves; this is the only way to notice.
 */
const SEEK_GRACE_MS = 1500;

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  const p = createAudioPlayer(null, { updateInterval: UPDATE_INTERVAL_MS });
  p.addListener("playbackStatusUpdate", onStatus);
  player = p;
  return p;
}

function durationLooksBogus(d: number): boolean {
  return (
    !Number.isFinite(d) || d <= 0 || (estimatedDuration > 5 && d < estimatedDuration * 0.5)
  );
}

function resolveDuration(): number {
  if (realDuration > 0) return realDuration;
  return estimatedDuration;
}

function formatTimeLeft(remaining: number): string {
  const secs = Math.max(0, Math.ceil(remaining));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `-${m}:${s.toString().padStart(2, "0")}`;
}

function onStatus(status: AudioStatus) {
  if (!state.spaceId) return;

  if (!durationLooksBogus(status.duration)) {
    if (realDuration === 0) {
      realDuration = status.duration;
      // A source that reports a duration has a real SeekMap behind it. The
      // WebM web records into reports none, and cannot be scrubbed at all.
      publish({ seekable: true });
      applyPendingSeek();
    } else {
      realDuration = status.duration;
    }
  }

  if (status.isLoaded && state.loading) publish({ loading: false });

  // A seek that never landed means the container has no index. Say so once,
  // rather than leaving a bar that swallows every drag.
  if (seekTarget && Date.now() - seekTarget.at > SEEK_GRACE_MS) {
    const landed = Math.abs(status.currentTime - seekTarget.seconds) < 3;
    seekTarget = null;
    if (!landed && state.seekable) {
      log.info("Seek did not land — treating this recording as unseekable");
      publish({ seekable: false });
    }
  }

  const dur = resolveDuration();
  const t = status.currentTime;
  // `paused` is deliberately not derived from `status.playing`: the player
  // reports not-playing while it buffers and for a beat after `replace()`, and
  // reading that back would dark every control mid-stream. Pause is a verb
  // this module owns.
  //
  // Every published number is quantized — position to half a second, progress
  // to 0.1% — so React bails on identical values. Unquantized, a status every
  // 200ms re-rendered every mounted control five times a second, and the
  // Recorded list can run to twenty rows.
  publish({
    position: Math.round(t * 2) / 2,
    duration: dur,
    progress: dur > 0 ? Math.round(Math.min(1, Math.max(0, t / dur)) * 1000) / 1000 : 0,
    timeLeft: dur > 0 ? formatTimeLeft(dur - t) : "",
  });

  if (status.didJustFinish) handleEnded();
}

function applyPendingSeek() {
  if (pendingSeekRatio === null || !player) return;
  const dur = resolveDuration();
  if (dur > 0) {
    const target = pendingSeekRatio * dur;
    pendingSeekRatio = null;
    void seekToSeconds(target);
  }
}

function handleEnded() {
  if (ending) return;
  ending = true;
  // Let the waveform show a full bar for a beat before it clears, rather than
  // snapping back to empty the instant the audio stops.
  publish({ progress: 1, timeLeft: "-0:00" });
  endTimeout = setTimeout(() => {
    endTimeout = null;
    stopStageRecording();
  }, 380);
}

async function seekToSeconds(seconds: number) {
  const p = player;
  if (!p) return;
  const dur = resolveDuration();
  const target = Math.max(0, dur > 0 ? Math.min(seconds, Math.max(0, dur - 0.5)) : seconds);
  // Published straight away: nothing pushes a status while paused, and the bar
  // would otherwise sit on the old position until playback resumed.
  publish({
    position: target,
    progress: dur > 0 ? Math.round(Math.min(1, target / dur) * 1000) / 1000 : 0,
    timeLeft: dur > 0 ? formatTimeLeft(dur - target) : "",
  });
  seekTarget = { seconds: target, at: Date.now() };
  try {
    await p.seekTo(target);
  } catch (e) {
    log.warn("Seek failed", e);
    seekTarget = null;
  }
}

/** Stop playback and drop the source. */
export function stopStageRecording() {
  if (endTimeout !== null) {
    clearTimeout(endTimeout);
    endTimeout = null;
  }
  if (player) {
    try {
      player.pause();
      // Dropping the source is what actually frees the download; pause alone
      // leaves a part-buffered file sitting in memory.
      player.replace(null);
    } catch (e) {
      log.warn("Failed to release the recording", e);
    }
  }
  realDuration = 0;
  estimatedDuration = 0;
  pendingSeekRatio = null;
  seekTarget = null;
  ending = false;
  publish(IDLE);
}

/**
 * Start a recording, optionally at a position. Replaces whatever was playing.
 *
 * @param seekRatio 0–1 start position, applied as soon as a duration is known.
 */
export function playStageRecording(space: StagePlayable, seekRatio?: number) {
  if (!space.recording_url) {
    toastInfo("Recording not available for this stage");
    return;
  }

  if (endTimeout !== null) {
    clearTimeout(endTimeout);
    endTimeout = null;
  }

  const p = ensurePlayer();
  try {
    p.pause();
  } catch {}

  estimatedDuration =
    space.started_at && space.ended_at
      ? Math.max(
          1,
          (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000,
        )
      : 0;
  realDuration = 0;
  pendingSeekRatio = seekRatio ?? null;
  seekTarget = null;
  ending = false;

  publish({
    spaceId: space.id,
    title: space.title || "Stage recording",
    loading: true,
    paused: false,
    progress: 0,
    position: 0,
    duration: estimatedDuration,
    // Assume nothing until the player reports a duration of its own.
    seekable: false,
    timeLeft: "",
  });

  void (async () => {
    try {
      await configureForPlayback();
      p.replace({ uri: space.recording_url! });
      // A fresh source starts at the persisted rate.
      try {
        p.shouldCorrectPitch = true;
        p.setPlaybackRate(state.rate);
      } catch (e) {
        log.warn("setPlaybackRate failed", e);
      }
      p.play();
    } catch (e) {
      log.error("Could not start the recording", e);
      toastError(e, "That recording could not be played");
      stopStageRecording();
    }
  })();

  void supabase
    .rpc("increment_stage_listens", { p_space_id: space.id })
    .then(({ error }) => {
      if (error) log.warn("increment_stage_listens failed", error);
    });
}

/**
 * Hold the audio where it is, keeping the recording loaded. Pausing is not
 * stopping: the position, the corner player and every lit control survive it.
 */
export function pauseStageRecording() {
  if (!player || !state.spaceId || state.paused) return;
  try {
    player.pause();
  } catch (e) {
    log.warn("Pause failed", e);
  }
  publish({ paused: true });
}

/** Pick up where a pause left off. */
export function resumeStageRecording() {
  if (!player || !state.spaceId || !state.paused) return;
  try {
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(state.rate);
    player.play();
  } catch (e) {
    log.warn("Resume failed", e);
    return;
  }
  publish({ paused: false });
}

/**
 * Play/pause whatever is loaded, with no reference to a stage object — the
 * corner player knows the id and nothing else.
 */
export function togglePauseStageRecording() {
  if (!state.spaceId) return;
  if (state.paused) resumeStageRecording();
  else pauseStageRecording();
}

/**
 * The play/pause control every surface hangs off. Pressing the recording that
 * is already loaded holds it rather than throwing the position away.
 */
export function toggleStageRecording(space: StagePlayable) {
  if (state.spaceId === space.id) {
    togglePauseStageRecording();
    return;
  }
  playStageRecording(space);
}

// ── The corner player ───────────────────────────────────────────────────────

/** Show the corner player for whatever is loaded. */
export function openStagePopout() {
  if (!state.spaceId) return;
  publish({ popout: true });
}

/** Hide the corner player. Playback is untouched — the X stops as well. */
export function closeStagePopout() {
  publish({ popout: false });
}

/**
 * Pop a recording out, starting it if it is not the one already loaded, so the
 * control works from a card nobody has pressed play on.
 */
export function popOutStageRecording(space: StagePlayable) {
  if (state.spaceId !== space.id) {
    playStageRecording(space);
    // Refused — no recording_url, and playStageRecording has already said so.
    if (state.spaceId !== space.id) return;
  }
  publish({ popout: true });
}

/**
 * Scrub. Seeking a recording that is not the one playing starts it there,
 * which is what makes the waveform under an idle row a scrub bar and not just
 * a picture.
 */
export function seekStageRecording(space: StagePlayable, position: number) {
  if (!space.recording_url) return;
  if (state.spaceId === space.id && player) {
    const dur = resolveDuration();
    if (dur > 0) {
      void seekToSeconds(position * dur);
      return;
    }
    pendingSeekRatio = position;
    return;
  }
  playStageRecording(space, position);
}

/**
 * Scrub whatever is currently playing, with no reference to the stage object.
 * The corner player knows the id and nothing else, and by definition the
 * recording it is showing is already loaded.
 */
export function scrubStageRecording(position: number) {
  if (!player || !state.spaceId) return;
  const dur = resolveDuration();
  if (dur > 0) void seekToSeconds(position * dur);
  else pendingSeekRatio = position;
}

/**
 * Jump to an absolute point, starting the recording if it is not the one
 * loaded. This is what a transcript line is: a timestamp, not a fraction.
 */
export function seekStageRecordingToTime(space: StagePlayable, seconds: number) {
  if (!space.recording_url) return;
  if (state.spaceId !== space.id) {
    const span =
      space.started_at && space.ended_at
        ? (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000
        : 0;
    playStageRecording(space, span > 0 ? Math.min(1, seconds / span) : 0);
    return;
  }
  void seekToSeconds(seconds);
  if (state.paused) resumeStageRecording();
}

// ── Who is still holding a control for this recording ───────────────────────
//
// A recording that outlives its last control is audible and unreachable, so the
// inline players stop one on unmount. But the same stage can be on screen more
// than once — a Recorded row with its transcript sheet open over it — and the
// sheet closing must not stop the row's audio. Hence a count, not a boolean.

const controlCounts = new Map<string, number>();

/** Called by every inline control while it is mounted. */
export function registerStageControl(spaceId: string): () => void {
  controlCounts.set(spaceId, (controlCounts.get(spaceId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (controlCounts.get(spaceId) ?? 1) - 1;
    if (next <= 0) controlCounts.delete(spaceId);
    else controlCounts.set(spaceId, next);
  };
}

/** Whether any inline control for this recording is still on screen. */
export function hasStageControl(spaceId: string): boolean {
  return (controlCounts.get(spaceId) ?? 0) > 0;
}

/** Subscribe to the shared player. */
export function useStagePlayback(): StagePlaybackState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    // Re-sync on mount: a card scrolled back into view must show that its own
    // recording is still the one playing.
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

/** Read the state once, outside React. */
export function getStagePlaybackState(): StagePlaybackState {
  return state;
}
