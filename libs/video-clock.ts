/**
 * Where a post's video is up to, for UI that lives outside the player.
 *
 * The skippable-sections sheet opens from the post's options menu, which has
 * no handle on the player. Players register a reader here under their token
 * id while mounted; the sheet reads it at the moment Start or End is tapped.
 *
 * One post can have two players mounted at once (the feed card under the
 * fullscreen player), so each post keeps a stack: the newest reader answers,
 * and unmounting one player leaves the other's reader in place.
 */
type Clock = () => number;

const clocks = new Map<string, Clock[]>();

export function registerVideoClock(tokenId: string | number | null | undefined, read: Clock): () => void {
  if (tokenId == null) return () => {};
  const key = String(tokenId);
  const stack = clocks.get(key) ?? [];
  stack.push(read);
  clocks.set(key, stack);
  return () => {
    const current = clocks.get(key);
    if (!current) return;
    const at = current.lastIndexOf(read);
    if (at !== -1) current.splice(at, 1);
    if (current.length === 0) clocks.delete(key);
  };
}

/** Seconds into the video, or 0 when no player for it is mounted. */
export function readVideoClock(tokenId: string | number | null | undefined): number {
  if (tokenId == null) return 0;
  try {
    const stack = clocks.get(String(tokenId));
    const value = stack?.[stack.length - 1]?.();
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}
