/**
 * A start time handed to the post page: a chapter tapped on the post info page
 * opens the post at that moment. Kept here rather than in route params because
 * the player sits three components below the screen. Read once.
 */
const pending = new Map<string, number>();

export function setPostStartTime(tokenId: string | number, seconds: number): void {
  if (seconds > 0) pending.set(String(tokenId), seconds);
}

export function takePostStartTime(tokenId: string | number | undefined): number {
  if (tokenId == null) return 0;
  const key = String(tokenId);
  const seconds = pending.get(key) ?? 0;
  pending.delete(key);
  return seconds;
}
