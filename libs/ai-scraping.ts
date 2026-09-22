/**
 * A creator's AI-scraping preference: whether they want AI systems to train
 * on or otherwise bulk-consume their content — audio, artwork, writing.
 *
 * Stored as a flat key in the account `customs` blob, which has no
 * server-side merge: a save must read the whole blob, change this one key,
 * and resend everything (see `libs/social-reach.ts` for the same
 * read-merge-resend shape). There is no migration and no backfill — an
 * account that has never touched this setting has no key at all, and
 * absence means the platform default: allow.
 *
 * This expresses the creator's wishes to crawlers that choose to honour de
 * facto standards. It is carried in page metadata only — never surfaced
 * as profile copy — and it cannot enforce anything against a crawler
 * that ignores those standards; nothing can, short of not publishing at all.
 * Mobile has no crawler surface of its own; this is the same stored
 * preference the web app reads and writes.
 */

export const AI_SCRAPING_CUSTOMS_KEY = 'aiScraping';

export type AiScrapingPreference = 'allow' | 'deny';

/**
 * Read the preference out of a `customs` blob. Only the literal string
 * `'deny'` opts out — absent, malformed, or any other value resolves to
 * `'allow'`, so an account that has never opened the setting is treated
 * the same as every other account rather than carrying a reservation it
 * never asked for.
 */
export function getAiScrapingPreference(
  customs: Record<string, unknown> | null | undefined,
): AiScrapingPreference {
  return customs?.[AI_SCRAPING_CUSTOMS_KEY] === 'deny' ? 'deny' : 'allow';
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
