interface StreamState {
  status?: string;
  isActive?: boolean;
  endedAt?: string;
  settings?: { status?: string };
  recording?: { status?: string };
}

export function hasStreamEnded(stream: unknown): boolean {
  const value = stream as StreamState | null | undefined;
  return ['ENDED', 'INACTIVE'].includes(value?.status?.toUpperCase() ?? '') ||
    value?.settings?.status?.toLowerCase() === 'ended';
}

export function isStreamLive(stream: unknown, fallback = false): boolean {
  const value = stream as StreamState | null | undefined;
  if (hasStreamEnded(value)) return false;
  const status = value?.status?.toUpperCase();
  if (['LIVE', 'ACTIVE', 'PAUSED'].includes(status ?? '')) return true;
  if (['SCHEDULED', 'OFFLINE'].includes(status ?? '') || value?.isActive === false) return false;
  return value?.isActive === true || fallback;
}

/** Refresh on-air state and briefly wait for a newly ended recording. */
export function streamRefreshInterval(stream: unknown, now = Date.now()): number | false {
  const value = stream as StreamState | null | undefined;
  if (isStreamLive(value)) return 30_000;
  if (!hasStreamEnded(value) || ['ready', 'failed', 'skipped'].includes(value?.recording?.status ?? '')) return false;
  const ended = Date.parse(value?.endedAt ?? '');
  return Number.isFinite(ended) && now - ended >= 0 && now - ended < 10 * 60_000 ? 10_000 : false;
}
