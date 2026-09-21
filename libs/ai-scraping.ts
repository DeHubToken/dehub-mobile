/**
 * A creator's AI-scraping preference: whether they want AI systems to train
 * on or otherwise bulk-consume their content — audio, artwork, writing.
 *
 * Stored as a flat key in the account `customs` blob, which has no
 * server-side merge: a save must read the whole blob, change this one key,
 * and resend everything (see `libs/social-reach.ts` for the same
 * read-merge-resend shape). There is no migration and no backfill — an
 * account that has never touched this setting has no key at all, and
 * absence means the safe default: deny.
 *
 * This expresses the creator's wishes to crawlers that choose to honour de
 * facto standards. It cannot enforce anything against a crawler that
 * ignores those standards — nothing can, short of not publishing at all.
 * Mobile has no crawler surface of its own; this is the same stored
 * preference the web app reads and writes.
 */

export const AI_SCRAPING_CUSTOMS_KEY = 'aiScraping';

export type AiScrapingPreference = 'allow' | 'deny';

/**
 * Read the preference out of a `customs` blob. Absent, malformed, or any
 * value other than the literal string `'allow'` all resolve to `'deny'` —
 * deny is the only default that keeps an untouched account's wishes from
 * being misrepresented as consent it never gave.
 */
export function getAiScrapingPreference(
  customs: Record<string, unknown> | null | undefined,
): AiScrapingPreference {
  return customs?.[AI_SCRAPING_CUSTOMS_KEY] === 'allow' ? 'allow' : 'deny';
}

/**
 * Read-merge-resend helper: apply a new preference onto an existing
 * `customs` blob without disturbing any other key it holds. Callers must
 * send the full returned object back on `/update_profile` — the API does
 * not merge.
 */
export function mergeAiScrapingPreference(
  customs: Record<string, string> | undefined | null,
  preference: AiScrapingPreference,
): Record<string, string> {
  return { ...(customs ?? {}), [AI_SCRAPING_CUSTOMS_KEY]: preference };
}
