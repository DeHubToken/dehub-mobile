/**
 * Error feedback — the sound a refusal makes
 * ==========================================
 * Tapping Follow twenty times in ten seconds gets the last few taps rejected
 * by the API's rate limiter, and until now that arrived as a silent no-op or a
 * generic "failed" toast. Neither tells the reader what to do differently, and
 * a toast alone is easy to miss mid-scroll while the thumb is still tapping.
 *
 * So a throttled request gets a short descending two-tone — the universal
 * "no" — alongside one toast that says to slow down. The sound is a bundled
 * 300ms WAV rather than a synthesised tone so it costs one decode and behaves
 * the same on every device.
 *
 * The toast carries a fixed id so a burst of rejections collapses into one
 * notice instead of a stack, and the sound is throttled to the same window.
 *
 * @module libs/error-feedback
 */

import { createAudioPlayer, type AudioPlayer } from "expo-audio";

import { toastError } from "./toast";
import i18n from "../i18n";

/** One shared player: the clip is tiny and replayed from the start each time. */
let player: AudioPlayer | null = null;

/** Two rejections inside this window are one event to the reader. */
const REPEAT_WINDOW_MS = 1500;
let lastPlayedAt = 0;

/** True once per window — a burst of rejections is one event to the reader. */
function withinRepeatWindow(): boolean {
  const now = Date.now();
  if (now - lastPlayedAt < REPEAT_WINDOW_MS) return true;
  lastPlayedAt = now;
  return false;
}

/** Play the short failure tone. Safe to call from anywhere; never throws. */
export function playErrorSound(): void {
  if (withinRepeatWindow()) return;
  playSound();
}

/** The player itself, unthrottled. */
function playSound(): void {
  try {
    if (!player) {
      player = createAudioPlayer(require("../assets/sounds/fail.wav"));
      player.volume = 0.6;
    }
    player.seekTo(0);
    player.play();
  } catch {
    // A UI sound is never worth an exception reaching the caller.
  }
}

/** True when a thrown API error is the server's rate limiter talking. */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number }).status;
  if (status === 429) return true;
  const message = String((error as { message?: unknown }).message ?? "");
  return /\b429\b|too many requests|rate limit/i.test(message);
}

/**
 * Announce a rate-limited action: the tone plus a single "slow down" toast.
 */
export function notifyRateLimited(): void {
  if (withinRepeatWindow()) return;
  playSound();

  const message = i18n.t("toasts.rate_limited", {
    defaultValue: "Rate limited, slow down",
  });
  toastError(message, message, { duration: 2500 });
}

/**
 * Handle a failed action uniformly: rate limiting gets the tone and the
 * slow-down notice, anything else gets the caller's own message.
 *
 * Returns true when the error was a rate limit, so callers can skip their own
 * error reporting.
 */
export function reportActionError(error: unknown, fallback: string): boolean {
  if (isRateLimitError(error)) {
    notifyRateLimited();
    return true;
  }
  toastError(error, fallback);
  return false;
}
