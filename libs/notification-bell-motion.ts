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
  'M10.4 7.6Q7.9 9.2 7.2 12.8L3.5 23.8',
  'M21.6 7.6Q24.1 9.2 24.8 12.8L28.5 23.8',
] as const;

/** CutAlerts outline, drawn red behind the bell as a soft rim while it rings. */
export const BELL_GLYPH_PATHS = [
  'M12.9 8.2V4.6Q12.9 2.5 15 2.5H19.1V8.2Z',
  'M2.5 26.8L7.2 12.8Q8.2 5.6 15 5.6H17Q23.8 5.6 24.8 12.8L29.5 26.8H20.2V25.7Q20.2 24.3 23.8 24.3H25.2L22.3 13.1Q21.6 8.2 17 8.2H15Q10.4 8.2 9.7 13.1L6.8 24.3H8.2Q11.8 24.3 11.8 25.7V26.8Z',
  'M14.1 28V22.9Q14.1 21.5 15.5 21.5H17.9V26.6Q17.9 28 16.5 28Z',
] as const;
