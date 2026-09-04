/**
 * Lock screen / notification controls — one owner at a time
 * ========================================================
 *
 * The OS Now Playing surface (iOS lock screen and Control Center, Android's
 * media notification) is a **single global slot**. expo-audio says as much:
 * "Only one player can control the lock screen at a time." DeHub can have
 * several things able to make noise at once — a radio station, a stage
 * recording, an audio post, a video — so calling
 * `setActiveForLockScreen(true, …)` straight from each player means the last
 * one to run wins, and the headphone pause button stops whichever of them
 * happened to start most recently rather than the one you can hear.
 *
 * This is the mobile counterpart of web's `src/lib/media-session.ts`, and it
 * makes ownership explicit in the same way: a player claims the slot when it
 * starts, updates it while it plays, and releases it when it stops. **Release
 * is ownership-checked** — a player tearing down after something else has
 * claimed the slot is a no-op, which is what stops closing a stage from
 * wiping a radio station's lock screen.
 *
 * Note this is separate from `libs/audioFocus`, which decides who is allowed
 * to be *audible*. Focus stops the other player; this decides whose metadata
 * the OS shows. They usually move together, but not always — a paused
 * recording keeps its notification so you can press play from the lock
 * screen without opening the app.
 *
 * Playing in the background is a two-part thing and this is only half of it:
 * the session category has to allow it as well
 * (`configureForBackgroundPlayback` in `libs/audioSession`), and on iOS the
 * Now Playing controls only appear at all while that category is `doNotMix`
 * or `auto`. Ducking silently costs you everything here.
 *
 * Every entry point is defensive. `setActiveForLockScreen` and friends were
 * added to expo-audio relatively recently, the web build of the module has a
 * narrower signature, and a player whose native object has already been
 * released throws on any call. None of that is worth crashing a feed over.
 *
 * @module libs/lockScreen
 */

import type { AudioPlayer } from "expo-audio";

import { createLogger } from "./logger";

const log = createLogger("lockScreen");

/** What the OS shows: title, who it is by, and the artwork beside it. */
export interface LockScreenTrack {
  title: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
}

/** Which transport buttons to offer beyond play/pause. */
export interface LockScreenControls {
  /** Skip-forward. Pointless on a live stream, which has nowhere to skip to. */
  showSeekForward?: boolean;
  showSeekBackward?: boolean;
}

/**
 * Who currently owns the slot. An id, not the player itself, so a module that
 * recreates its player (radio does, on every station change) keeps ownership
 * across the swap.
 */
let ownerId: string | null = null;
let ownerPlayer: AudioPlayer | null = null;

function toMetadata(track: LockScreenTrack) {
  return {
    title: track.title,
    artist: track.artist,
    albumTitle: track.albumTitle,
    artworkUrl: track.artworkUrl,
  };
}

/**
 * Take the lock screen for `player`, displacing whoever held it.
 *
 * Call this on a *deliberate* press of play, never on an autoplaying muted
 * preview: a card scrolled past that seizes the slot means the headphone
 * button pauses a silent thumbnail instead of the radio.
 */
export function claimLockScreen(
  id: string,
  player: AudioPlayer,
  track: LockScreenTrack,
  controls: LockScreenControls = {},
): void {
  // Clear the previous owner explicitly rather than letting the new claim
  // overwrite it. On Android the old player otherwise keeps a foreground
  // service notification of its own alive alongside the new one.
  if (ownerPlayer && ownerPlayer !== player) {
    try {
      ownerPlayer.clearLockScreenControls?.();
    } catch {}
  }

  ownerId = id;
  ownerPlayer = player;

  try {
    player.setActiveForLockScreen?.(true, toMetadata(track), {
      showSeekForward: controls.showSeekForward ?? false,
      showSeekBackward: controls.showSeekBackward ?? false,
    });
  } catch (e) {
    log.warn("Could not claim the lock screen", e);
  }
}

/**
 * Change what the current owner is showing — a radio station's now-playing
 * line, a stage whose title arrived after playback started.
 *
 * A no-op from anything that does not own the slot, so a late update from a
 * player that has since been displaced cannot steal it back.
 */
export function updateLockScreen(id: string, track: LockScreenTrack): void {
  if (ownerId !== id || !ownerPlayer) return;
  try {
    ownerPlayer.updateLockScreenMetadata?.(toMetadata(track));
  } catch (e) {
    log.warn("Could not update the lock screen", e);
  }
}

/**
 * Give the slot back, if this owner still holds it.
 *
 * The ownership check is the point: players release on unmount, and by then
 * something else may well have claimed the slot legitimately. Releasing
 * unconditionally is how a stage drawer closing used to kill a radio
 * station's notification.
 */
export function releaseLockScreen(id: string): void {
  if (ownerId !== id) return;
  const player = ownerPlayer;
  ownerId = null;
  ownerPlayer = null;
  try {
    player?.clearLockScreenControls?.();
  } catch (e) {
    log.warn("Could not release the lock screen", e);
  }
}

/** Whether `id` currently owns the slot. Exposed for tests. */
export function ownsLockScreen(id: string): boolean {
  return ownerId === id;
}
