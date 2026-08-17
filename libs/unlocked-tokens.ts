/**
 * Tokens the viewer unlocked (paid the PPV) THIS app session.
 *
 * FeedCard used to keep the unlock in component state, so a card recycled out
 * of the FlatList window re-locked a post the viewer had just paid for until
 * the next refetch delivered the server's isUnlocked. In-memory only — the
 * mobile mirror of web's sessionStorage unlocked-tokens store: the server's
 * flag takes over on the next real fetch, and sign-out clears it so one
 * account's unlocks never paint for another.
 */

const unlocked = new Set<string>();

export function markTokenUnlocked(tokenId: string | number | null | undefined): void {
  if (tokenId == null) return;
  unlocked.add(String(tokenId));
}

export function isTokenUnlocked(tokenId: string | number | null | undefined): boolean {
  return tokenId != null && unlocked.has(String(tokenId));
}

export function clearUnlockedTokens(): void {
  unlocked.clear();
}
