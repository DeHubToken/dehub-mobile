/**
 * Creators' own AI provider keys. Mirrors web's src/lib/api/dehub/provider-keys.ts
 * (server: dehubweb supabase/functions/provider-keys). The full key goes to the
 * server once, on save, and is never sent back or kept on the phone.
 */
import env from '../config/env';
import { dehubAuthHeaders } from './ai.service';

export type ProviderKeyStatus = 'working' | 'invalid' | 'no_credit' | 'disabled';

export interface ProviderKeyRow {
  id: string;
  label: string;
  powers: string;
  keysUrl: string;
  saved: { last4: string; status: ProviderKeyStatus; checkedAt: string; lastUsedAt: string | null } | null;
}

async function call<T>(method: 'GET' | 'POST', body?: Record<string, unknown>): Promise<T> {
  const headers = await dehubAuthHeaders();
  const res = await fetch(`${env.SUPABASE_EDGE_BASE_URL}/provider-keys`, {
    method,
    headers: {
      ...headers,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
  return data as T;
}

export const listProviderKeys = () => call<{ providers: ProviderKeyRow[] }>('GET').then((r) => r.providers);
export const saveProviderKey = (provider: string, key: string) =>
  call<{ ok: true; last4: string; status: ProviderKeyStatus }>('POST', { action: 'save', provider, key });
export const testProviderKey = (provider: string) =>
  call<{ ok: true; last4: string; status: ProviderKeyStatus }>('POST', { action: 'test', provider });
export const removeProviderKey = (provider: string) => call<{ ok: true }>('POST', { action: 'remove', provider });
