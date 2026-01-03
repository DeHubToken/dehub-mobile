/**
 * Video Player Utility Functions
 */

/**
 * Format milliseconds to MM:SS or H:MM:SS format
 */
export const formatTime = (ms: number): string => {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Clamp a number between min and max
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Calculate progress ratio from position and duration
 */
export const getProgressRatio = (position: number, duration: number): number => {
  if (!duration || duration <= 0) return 0;
  return clamp(position / duration, 0, 1);
};

/**
 * Constants for video player behavior
 */
export const PLAYER_CONSTANTS = {
  HIDE_CONTROLS_DELAY: 3500,
  SEEK_FORWARD_SECONDS: 10,
  SEEK_BACKWARD_SECONDS: 10,
  DOUBLE_TAP_DELAY: 300,
  TIME_UPDATE_INTERVAL: 0.25,
  SEEK_ANIMATION_DURATION: 150,
  SEEK_FADE_IN_DURATION: 100,
  SEEK_VISIBLE_DURATION: 400,
  SEEK_FADE_OUT_DURATION: 200,
} as const;

/**
 * Player status types
 */
export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'error';

/**
 * Seek direction type
 */
export type SeekDirection = 'forward' | 'backward';
