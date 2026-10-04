import { supabase } from '../services/supabase';
import { withWalletHeader } from './supabase-wallet-client';
import { getAuthToken } from './auth.utils';
import { tokenRefreshManager } from './token-refresh';

export async function workRpc<T = unknown>(wallet: string, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await withWalletHeader(supabase.rpc(name as never, args as never), wallet);
  if (error) throw error;
  return data as T;
}

export async function workReceipt(id: string, hash: string, chain: number, escrow?: string) {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error('Sign in to verify this payment');
  const response = await fetch('https://dehub.io/api/work/receipt', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': token },
    body: JSON.stringify({ id, hash, chain, ...(escrow ? { escrow } : {}) }),
  });
  if (response.status === 202) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not verify the chain receipt');
  return data as { payload: string; signature: string };
}
