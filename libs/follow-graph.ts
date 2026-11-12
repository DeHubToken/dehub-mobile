/**
 * Signs follows so they belong to the wallet, not our database. Same scheme
 * and wire formats as web (src/lib/follow-graph.ts) and the backend
 * (src/follow-graph): a device "follow key" the wallet OKs once, then every
 * follow/unfollow is signed by the key with no prompt.
 *
 * - Built-in wallet: OK'd silently while the wallet is open (signed by the
 *   Safe account, like sign-in); a locked wallet just waits, no unlock sheet.
 * - Connect Wallet (MetaMask etc. over WalletConnect): asked once, on a
 *   follow; "no" is remembered for 30 days.
 *
 * Nothing here can break a follow: every failure is swallowed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { Wallet } from 'ethers';
import { apiClient } from './api.client';
import { getEoaSigningProvider, getSigningProvider, isExternalSigner, onEoaSigningProvider } from './provider.registry';

type Action = 'follow' | 'unfollow';
interface Pending { action: Action; target: string; at: number }

const ADDRESS = /^0x[0-9a-f]{40}$/;
const DECLINE_MS = 30 * 24 * 60 * 60_000;
// SecureStore keys may only hold [A-Za-z0-9._-]; a 0x address qualifies.
const KEY = (w: string) => `riftn.followKey.${w}`;
const OK = (w: string) => `riftn.followKeyOk.${w}`;
const OUTBOX = (w: string) => `riftn.followOutbox.${w}`;
const DECLINED = (w: string) => `riftn.followKeyDeclined.${w}`;
const BACKFILLED = (w: string) => `riftn.followBackfilled.${w}`;

/** Must match backend keyMessage() byte for byte. */
export function keyMessage(wallet: string, key: string, issuedAt: Date): string {
  return [
    'Riftn follow key',
    '',
    'Let this key sign my follows and unfollows:',
    key,
    '',
    `Wallet: ${wallet}`,
    `Issued: ${issuedAt.toISOString()}`,
    '',
    'This cannot move funds. Cancel it any time in Riftn settings.',
  ].join('\n');
}

/** Must match backend proofMessage(). */
export function proofMessage(action: Action, follower: string, target: string, at: number): string {
  return `riftn-follow:v1:${action}:${follower}:${target}:${at}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

async function personalSign(provider: any, message: string, from: string): Promise<string> {
  const hex = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
  try {
    return await provider.request({ method: 'personal_sign', params: [hex, from] });
  } catch (e) {
    const error = e as { code?: number; message?: string };
    if (error?.code !== -32602 && !/invalid params|invalid parameters/i.test(error?.message ?? '')) throw e;
    return provider.request({ method: 'personal_sign', params: [from, hex] });
  }
}

/** The wallet's signature over its key OK, or null when we may not ask now. */
async function walletSignature(wallet: string, message: string, mayAsk: boolean): Promise<string | null> {
  const session = getSigningProvider();
  if (isExternalSigner()) {
    if (!mayAsk || Date.now() - (await readJson<number>(DECLINED(wallet), 0)) < DECLINE_MS) return null;
    try {
      return await personalSign(session, message, wallet);
    } catch {
      await writeJson(DECLINED(wallet), Date.now());
      return null;
    }
  }
  // Built-in wallet: only while it is open (the EOA signer is registered).
  const eoa = getEoaSigningProvider();
  if (typeof eoa?.request !== 'function') return null;
  try {
    // The account is usually the Safe the key owns: sign as the Safe.
    const accounts: string[] = (await session?.request?.({ method: 'eth_accounts' })) ?? [];
    if (accounts[0]?.toLowerCase() === wallet) return await personalSign(session, message, accounts[0]);
    const owner: string[] = (await eoa.request({ method: 'eth_accounts' })) ?? [];
    return await personalSign(eoa, message, owner[0] ?? wallet);
  } catch {
    return null;
  }
}

async function followKey(wallet: string, mayAsk: boolean): Promise<Wallet | null> {
  let pk = await SecureStore.getItemAsync(KEY(wallet)).catch(() => null);
  if (pk && (await AsyncStorage.getItem(OK(wallet)).catch(() => null)) === '1') return new Wallet(pk);
  if ((await readJson<number>(DECLINED(wallet), 0)) > Date.now()) return null; // turned off
  if (!pk) {
    pk = Wallet.createRandom().privateKey;
    await SecureStore.setItemAsync(KEY(wallet), pk);
  }
  const key = new Wallet(pk);
  const issuedAt = new Date();
  const signature = await walletSignature(wallet, keyMessage(wallet, key.address.toLowerCase(), issuedAt), mayAsk);
  if (!signature) return null;
  const res: any = await apiClient.post('/follow_graph/keys', { key: key.address, issuedAt: issuedAt.toISOString(), signature }, { isAuthRequired: true }).catch(() => null);
  if (!(res?.data ?? res)?.status) return null;
  await AsyncStorage.setItem(OK(wallet), '1').catch(() => {});
  return key;
}

async function upload(wallet: string, key: Wallet, items: Pending[]) {
  for (let i = 0; i < items.length; i += 500) {
    const proofs = await Promise.all(items.slice(i, i + 500).map(async (p) => ({
      ...p, signature: await key.signMessage(proofMessage(p.action, wallet, p.target, p.at)),
    })));
    await apiClient.post('/follow_graph/proofs', { proofs }, { isAuthRequired: true });
  }
}

let flushing: Promise<void> | null = null;

async function flush(wallet: string, mayAsk: boolean) {
  const key = await followKey(wallet, mayAsk);
  if (!key) return;
  const outbox = await readJson<Pending[]>(OUTBOX(wallet), []);
  if (outbox.length) {
    await upload(wallet, key, outbox);
    const left = (await readJson<Pending[]>(OUTBOX(wallet), [])).filter((p) => !outbox.some((q) => q.target === p.target && q.at === p.at));
    await writeJson(OUTBOX(wallet), left);
  }
  // Follows from before this (or another device) get signed once, in bulk.
  if (Date.now() - (await readJson<number>(BACKFILLED(wallet), 0)) > 24 * 60 * 60_000) {
    const res: any = await apiClient.get('/follow_graph/me/unsigned', { isAuthRequired: true }).catch(() => null);
    const list: string[] = (res?.data ?? res)?.result ?? [];
    const at = Math.floor(Date.now() / 1000);
    const targets = list.filter((t) => ADDRESS.test(t));
    if (targets.length) await upload(wallet, key, targets.map((target) => ({ action: 'follow' as const, target, at })));
    await writeJson(BACKFILLED(wallet), Date.now());
  }
}

function run(wallet: string, mayAsk: boolean) {
  if (flushing) return flushing;
  flushing = flush(wallet, mayAsk).catch(() => undefined).finally(() => { flushing = null; });
  return flushing;
}

/** Call after a follow/unfollow succeeded. Never throws, never blocks. */
export function signFollow(action: Action, follower: string, target: string) {
  const wallet = follower?.toLowerCase();
  const to = target?.toLowerCase();
  if (!ADDRESS.test(wallet ?? '') || !ADDRESS.test(to ?? '') || to === wallet) return;
  void (async () => {
    const outbox = (await readJson<Pending[]>(OUTBOX(wallet), [])).filter((p) => p.target !== to);
    outbox.push({ action, target: to, at: Math.floor(Date.now() / 1000) });
    await writeJson(OUTBOX(wallet), outbox.slice(-2000));
    await run(wallet, true);
  })().catch(() => {});
}

/** Quiet catch-up (app open, wallet unlock): never prompts. */
export function syncFollowSignatures(wallet: string | null | undefined) {
  const w = wallet?.toLowerCase();
  if (w && ADDRESS.test(w)) void run(w, false);
}

/** Settings: is this device signing follows for this wallet? */
export async function followSigningOn(wallet: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  return (await AsyncStorage.getItem(OK(w)).catch(() => null)) === '1';
}

/** Settings "Turn on": asks now, even after an earlier no. */
export async function turnOnFollowSigning(wallet: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  await AsyncStorage.multiRemove([DECLINED(w), BACKFILLED(w)]).catch(() => {});
  if (!isExternalSigner() && typeof getEoaSigningProvider()?.request !== 'function') {
    // Built-in wallet locked: this tap may open it.
    const { OPEN_WALLET_METHOD } = await import('./provider.registry');
    await getSigningProvider()?.request?.({ method: OPEN_WALLET_METHOD }).catch(() => null);
  }
  await run(w, true);
  return followSigningOn(w);
}

/** Settings "Turn off": cancels this device's key and stops asking. */
export async function turnOffFollowSigning(wallet: string): Promise<void> {
  const w = wallet.toLowerCase();
  const pk = await SecureStore.getItemAsync(KEY(w)).catch(() => null);
  if (pk) await apiClient.post('/follow_graph/keys/revoke', { key: new Wallet(pk).address }, { isAuthRequired: true }).catch(() => null);
  await SecureStore.deleteItemAsync(KEY(w)).catch(() => {});
  await AsyncStorage.multiRemove([OK(w), OUTBOX(w)]).catch(() => {});
  await writeJson(DECLINED(w), Date.now() + 100 * 365 * 24 * 60 * 60_000);
}

// Catch up quietly whenever the built-in wallet opens: it can sign the key OK
// with no prompt then.
// (Guarded: tests that stub the registry may leave it out.)
if (typeof onEoaSigningProvider === 'function') onEoaSigningProvider(() => {
  setTimeout(() => {
    void (async () => {
      const accounts: string[] = (await getSigningProvider()?.request?.({ method: 'eth_accounts' })) ?? [];
      syncFollowSignatures(accounts[0]);
    })().catch(() => {});
  }, 5_000);
});
