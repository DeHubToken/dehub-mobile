import { apiClient } from '../libs/api.client';
import { translateCopy as _translateCopy } from '../i18n/copy';

/**
 * Keyword filters — a viewer's private list of words and phrases
 * (dehub-stream-backend models/KeywordFilter). The server only keeps the
 * list; posts are matched on the device by libs/keyword-filters.
 */
export type FilterAction = 'warn' | 'hide';
export type FilterContext = 'home' | 'public' | 'notifications' | 'thread' | 'profile';

export const FILTER_CONTEXTS: FilterContext[] = ['home', 'public', 'notifications', 'thread', 'profile'];

export interface KeywordFilter {
  id: string;
  phrase: string;
  wholeWord: boolean;
  action: FilterAction;
  contexts: FilterContext[];
  /** ISO time it stops applying; null keeps it until removed. */
  expiresAt: string | null;
  createdAt: string | null;
}

export interface KeywordFilterInput {
  phrase?: string;
  wholeWord?: boolean;
  action?: FilterAction;
  contexts?: FilterContext[];
  /** Seconds from now; null for no expiry. */
  expiresIn?: number | null;
}

function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || _translateCopy("copy.cfce761befa8", { defaultValue: "Request failed" }));
  return (response?.result ?? response) as T;
}

export async function getKeywordFilters(): Promise<KeywordFilter[]> {
  const list = unwrap<KeywordFilter[]>(await apiClient.get('/keyword-filters', { isAuthRequired: true }));
  return Array.isArray(list) ? list : [];
}

/** Adds a filter, or updates the one already on that phrase. */
export async function createKeywordFilter(input: KeywordFilterInput): Promise<KeywordFilter> {
  return unwrap(await apiClient.post('/keyword-filters', input, { isAuthRequired: true }));
}

export async function deleteKeywordFilter(id: string): Promise<void> {
  unwrap(await apiClient.delete(`/keyword-filters/${encodeURIComponent(id)}`, { isAuthRequired: true }));
}
