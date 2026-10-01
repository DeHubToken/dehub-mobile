// Manually excluded from Music only; the original posts remain available.
const EXCLUDED_MUSIC_POST_IDS = new Set(["2800", "2755", "2750"]);

export function isVisibleInMusic(post: { tokenId?: string | number; id?: string | number }): boolean {
  return !EXCLUDED_MUSIC_POST_IDS.has(String(post.tokenId ?? post.id));
}
