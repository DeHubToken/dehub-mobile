/**
 * "Add to EFP" (efp.app). Mirrors web lib/efp: the built-in wallet's Safe on
 * Base mints an EFP list and makes Riftn's relayer its manager in one
 * sponsored transaction; the backend (src/follow-graph/efp.service) then
 * keeps the list in sync. Own wallets do this on riftn.com, where the wallet
 * can switch to Base.
 */
import { Wallet } from 'ethers';
import { apiClient } from './api.client';
import { isExternalSigner } from './provider.registry';
import { getLocalAccountDetails } from './wallets.local';
import { setupAAProvider } from './wallet-core/smart-account';
import { writeBatchAA } from './aa.write';

export type EfpStatus = 'none' | 'pending' | 'on' | 'off';
export interface EfpState { status: EfpStatus; synced: number; error: string | null }
export type EfpTurnOn = 'on' | 'already-has-list' | 'use-web' | 'unlock' | 'failed';

interface Setup { ok: boolean; status?: EfpStatus; error?: string; calls?: Array<{ to: string; data: `0x${string}` }> }

const BASE = 8453;
const result = (res: any) => res?.data?.result ?? res?.result ?? null;

export async function efpState(): Promise<EfpState | null> {
  return result(await apiClient.get('/follow_graph/efp', { isAuthRequired: true }).catch(() => null));
}

export async function turnOnEfp(wallet: string): Promise<EfpTurnOn> {
  if (isExternalSigner()) return 'use-web';
  const setup: Setup | null = result(await apiClient.post('/follow_graph/efp/setup', {}, { isAuthRequired: true }).catch(() => null));
  if (!setup) return 'failed';
  if (setup.status === 'on') return 'on';
  if (setup.error === 'already-has-list') return 'already-has-list';
  if (!setup.ok || !setup.calls?.length) return 'failed';
  const details = await getLocalAccountDetails(wallet).catch(() => null);
  if (!details?.privateKey) return 'unlock';
  try {
    const safe = await setupAAProvider(new Wallet(details.privateKey).address, details.privateKey, BASE);
    const [from] = ((await safe?.request({ method: 'eth_accounts' })) as string[] | undefined) ?? [];
    if (!safe || from?.toLowerCase() !== wallet.toLowerCase()) return 'failed';
    await writeBatchAA(safe, setup.calls, { context: 'EFP list' });
  } catch {
    return 'failed';
  }
  // The chain read can trail the receipt by a block or two.
  for (let i = 0; i < 5; i++) {
    const r: Setup | null = result(await apiClient.post('/follow_graph/efp/confirm', {}, { isAuthRequired: true }).catch(() => null));
    if (r?.ok) return 'on';
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return 'failed';
}

export async function turnOffEfp(): Promise<void> {
  await apiClient.post('/follow_graph/efp/off', {}, { isAuthRequired: true }).catch(() => null);
}
