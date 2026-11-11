/**
 * Follow back chime: the sound "Follow back all" makes when it appears
 * ======================================================================
 * Two soft bell notes a fifth apart (G5 then D6). Twin of the web's
 * src/lib/follow-back-chime.ts; the WAV is rendered from the same notes by
 * scripts/render-follow-back-chime.py.
 *
 * Plays through expo-audio like libs/error-feedback, at a low level, and never
 * throws. iOS follows the ringer switch unless something on screen (a video)
 * has already asked to play in silent mode.
 *
 * @module libs/follow-back-chime
 */

import { createAudioPlayer, type AudioPlayer } from "expo-audio";

let player: AudioPlayer | null = null;

/** Quiet on purpose: this is a nudge, not a notification. */
const VOLUME = 0.35;

function ensurePlayer(): AudioPlayer {
  if (!player) {
    player = createAudioPlayer(require("../assets/sounds/follow-back.wav"));
    player.volume = VOLUME;
  }
  return player;
}

/**
 * Load the clip ahead of time. The first play otherwise waits on the asset
 * being read and decoded, which is what made the chime trail the buzz.
 */
export function preloadFollowBackChime(): void {
  try {
    ensurePlayer();
  } catch {
    // A UI sound is never worth an exception reaching the caller.
  }
}

/** Play the chime once. Safe to call from anywhere. */
export function playFollowBackChime(): void {
  try {
    const p = ensurePlayer();
    // Already at the start on a fresh player; seeking first would wait a beat.
    if (p.currentTime > 0) p.seekTo(0);
    p.play();
  } catch {
    // A UI sound is never worth an exception reaching the caller.
  }
}
