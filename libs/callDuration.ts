export function formatCallDuration(startedAt: number | null, now = Date.now()): string {
  const seconds = startedAt == null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

