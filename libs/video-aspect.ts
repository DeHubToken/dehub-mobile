/**
 * The clip's width/height as the backend probed it at upload (`videoInfo`),
 * so a feed card reserves the right frame before its poster or player has
 * measured anything. Undefined when the post carries no usable size.
 *
 * ffprobe reports the coded size, before any rotation flag, so a rotated
 * phone clip can come back sideways. The thumbnail and the player still win
 * once they are measured; this only replaces the 16:9 guess.
 */
export function storedVideoAspect(info: unknown): number | undefined {
  if (!info || typeof info !== 'object') return undefined;
  const { w, h } = info as { w?: unknown; h?: unknown };
  if (typeof w !== 'number' || typeof h !== 'number' || !(w > 0) || !(h > 0)) return undefined;
  return w / h;
}
