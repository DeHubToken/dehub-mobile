/**
 * Text for a request sent from a search that found nothing (see
 * components/Search/SearchRequestPrompt). Same as web's
 * src/lib/search-request.ts. Pure so the wording and row shape are testable.
 */
export type SearchRequestSource = 'menu' | 'settings';

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** Ready-to-send wording, in the reader's language. */
export function searchRequestDraft(query: string, source: SearchRequestSource, t: Translate): string {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 60);
  return source === 'settings'
    ? t('sidebar.requestDraftSettings', 'A setting for {{query}}', { query: q })
    : t('sidebar.requestDraftMenu', 'Add {{query}} to Riftn', { query: q });
}

/**
 * Title is what they sent; the description adds what they had searched and
 * where, so the board can tell a menu miss from a settings miss. English on
 * purpose: it is read by the team, like the device line on bug reports.
 */
export function searchRequestFields(text: string, query: string, source: SearchRequestSource) {
  const body = text.trim().replace(/\s+/g, ' ');
  const where = source === 'settings' ? 'Settings search' : 'menu search';
  return {
    title: body.slice(0, 100).replace(/[\uD800-\uDBFF]$/, ''),
    description: `${body}\n\nSearched the ${where} for "${query.trim().slice(0, 100)}" and found nothing.`,
  };
}
