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

/** Play the chime once. Safe to call from anywhere. */
export function playFollowBackChime(): void {
  try {
    if (!player) {
      player = createAudioPlayer(require("../assets/sounds/follow-back.wav"));
      player.volume = VOLUME;
    }
    player.seekTo(0);
    player.play();
  } catch {
    // A UI sound is never worth an exception reaching the caller.
  }
}
