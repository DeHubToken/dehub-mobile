/** Shared with mobile: Soft bloom at 10–30 unread, gently stronger above it. */
export function notificationBellMotion(count: number) {
  const unread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const intensity = unread === 0 ? 0 : unread < 10
    ? 0.78 + 0.22 * (unread - 1) / 9
    : unread <= 30 ? 1 : 1 + 0.8 * (1 - Math.exp(-Math.log(unread / 30) / 3));
  return {
    unread,
    intensity,
    swing: 13 * Math.min(intensity, 1.4),
    opacity: 0.4 * intensity,
    reach: Math.min(12, 8 * intensity),
    stroke: 1.1 * (0.85 + 0.15 * intensity),
    cycleMs: Math.round(3400 / Math.sqrt(Math.max(1, intensity))),
  };
}

/** Follow the flared sides of CutAlerts, in its original 32-unit viewBox. */
export const BELL_SIDE_RIPPLE_PATHS = [
  'M10.4 7.1Q7.9 8.7 7.2 12.3L3.5 23.3',
  'M21.6 7.1Q24.1 8.7 24.8 12.3L28.5 23.3',
] as const;
