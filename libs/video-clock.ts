/**
 * Where a post's video is up to, for UI that lives outside the player.
 *
 * The skippable-sections sheet opens from the post's options menu, which has
 * no handle on the player. Players register a reader here under their token
 * id while mounted; the sheet reads it at the moment Start or End is tapped.
 */
type Clock = () => number;

const clocks = new Map<string, Clock>();

export function registerVideoClock(tokenId: string | number | null | undefined, read: Clock): () => void {
  if (tokenId == null) return () => {};
  const key = String(tokenId);
  clocks.set(key, read);
  return () => {
    if (clocks.get(key) === read) clocks.delete(key);
  };
}

/** Seconds into the video, or 0 when no player for it is mounted. */
export function readVideoClock(tokenId: string | number | null | undefined): number {
  if (tokenId == null) return 0;
  try {
    const value = clocks.get(String(tokenId))?.();
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
