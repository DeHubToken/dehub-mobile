/**
 * Posts whose content warning the person has already opened this session, so
 * a warned video opened from a card they revealed plays straight away in the
 * shorts viewer instead of asking twice.
 */
const seen = new Set<string>();

export function markContentWarningSeen(tokenId: string | number | null | undefined): void {
  if (tokenId == null || tokenId === "") return;
  seen.add(String(tokenId));
  if (seen.size > 500) seen.delete(seen.values().next().value!);
}

export function isContentWarningSeen(tokenId: string | number | null | undefined): boolean {
  return tokenId != null && seen.has(String(tokenId));
}
