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

/** CutAlerts outline, drawn red behind the bell as a soft rim while it rings. */
export const BELL_GLYPH_PATHS = [
  'M12.9 7.7V2.6Q12.9 .5 15 .5H19.1V7.7Z',
  'M2.5 26.3L7.2 12.3Q8.2 5.1 15 5.1H17Q23.8 5.1 24.8 12.3L29.5 26.3H20.2V25.2Q20.2 23.8 23.8 23.8H25.2L22.3 12.6Q21.6 7.7 17 7.7H15Q10.4 7.7 9.7 12.6L6.8 23.8H8.2Q11.8 23.8 11.8 25.2V26.3Z',
  'M14.1 29.3V24.2Q14.1 22.8 15.5 22.8H17.9V27.9Q17.9 29.3 16.5 29.3Z',
] as const;
