/** Count playback time without crediting seeks, hidden views or unattended gaps. */
export function supportedWatchDelta(mediaDelta: number, elapsed: number, playing: boolean, visible: boolean): number {
  if (!playing || !visible || !Number.isFinite(mediaDelta) || !Number.isFinite(elapsed)
    || elapsed <= 0 || elapsed > 2 || mediaDelta <= 0 || mediaDelta > 2 || mediaDelta > elapsed + 0.3) return 0;
  return Math.min(mediaDelta, elapsed);
}

export function shouldSendSupportProgress(played: number, sent: number, pending: boolean): boolean {
  return !pending && (played - sent >= 4 || (played >= 30 && played > sent));
}
