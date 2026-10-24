import { apiClient } from '../libs/api.client';
import { translateCopy as _translateCopy } from '../i18n/copy';

/**
 * Mastodon apps (Ivory, Tusky, Elk…) this account signed in to through
 * dehub.io/oauth/authorize (backend src/mastodon). Removing one revokes its
 * tokens at once.
 */
export interface ConnectedApp {
  clientId: string;
  name: string;
  website: string | null;
  scopes: string[];
  createdAt: string | null;
  lastUsedAt: string | null;
}

function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || _translateCopy("copy.cfce761befa8", { defaultValue: "Request failed" }));
  return (response?.result ?? response) as T;
}

export async function getConnectedApps(): Promise<ConnectedApp[]> {
  const list = unwrap<ConnectedApp[]>(await apiClient.get('/mastodon/authorizations', { isAuthRequired: true }));
  return Array.isArray(list) ? list : [];
}

export async function removeConnectedApp(clientId: string): Promise<void> {
  unwrap(await apiClient.delete(`/mastodon/authorizations/${encodeURIComponent(clientId)}`, { isAuthRequired: true }));
}
