import { supabase } from '../services/supabase';
import { withWalletHeader } from './supabase-wallet-client';
import { getAuthToken } from './auth.utils';
import { tokenRefreshManager } from './token-refresh';
import { translateCopy as _translateCopy } from '../i18n/copy';

export async function workRpc<T = unknown>(wallet: string, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await withWalletHeader(supabase.rpc(name as never, args as never), wallet);
  if (error) throw error;
  return data as T;
}

export async function workReceipt(id: string, hash: string, chain: number, escrow?: string) {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error(_translateCopy('copy.7fa1dcbb20fe', { defaultValue: 'Sign in to verify this payment' }));
  const response = await fetch('https://dehub.io/api/work/receipt', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': token },
    body: JSON.stringify({ id, hash, chain, ...(escrow ? { escrow } : {}) }),
  });
  if (response.status === 202) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || _translateCopy('copy.59c84e9a9e0a', { defaultValue: 'Could not verify the chain receipt' }));
  return data as { payload: string; signature: string };
}
