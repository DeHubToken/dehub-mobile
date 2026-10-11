/** Page wrappers reveal the scene; cards and modal surfaces own their fills. */
export function canvasPageBackground(hex: string, platform: string): string {
  if (platform === 'android') return 'transparent';
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},0.6)`;
}
