import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { normalizeSubReferral, referralFromUrl, type ReferralTouch } from './affiliate-subref';
import { supabase } from '../services/supabase';
import { withWalletHeader } from './supabase-wallet-client';

const KEY = 'dehub-affiliate-first-touch';
const TTL = 90 * 86400_000;
let writes: Promise<unknown> = Promise.resolve();
const attributed = new Set<string>();

async function readTouch(): Promise<(ReferralTouch & { expiresAt: number }) | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const touch = JSON.parse(raw);
    if (typeof touch.code !== 'string' || !/^[A-Z0-9_-]{3,40}$/.test(touch.code) || !(touch.expiresAt > Date.now())) return null;
    return { code: touch.code, subId: normalizeSubReferral(touch.subId), expiresAt: touch.expiresAt };
  } catch { return null; }
}

export function captureAffiliateUrl(url: string): Promise<void> {
  const touch = referralFromUrl(url);
  if (!touch) return Promise.resolve();
  const next = writes.catch(() => undefined).then(async () => {
    if (await readTouch()) return;
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...touch, expiresAt: Date.now() + TTL }));
  });
  writes = next;
  return next;
}

export async function attributePendingReferral(wallet: string): Promise<void> {
  await writes.catch(() => undefined);
  const touch = await readTouch();
  if (!touch) return;
  const key = `${wallet.toLowerCase()}:${touch.code}:${touch.subId ?? ''}`;
  if (attributed.has(key)) return;
  const { error } = await withWalletHeader(
    supabase.rpc('attribute_affiliate_referral' as never, { p_code: touch.code, p_sub_id: touch.subId } as never), wallet,
  );
  if (error) throw error;
  attributed.add(key);
}

/** Capture while signed out; attribution waits until the account is ready. */
export function watchAffiliateAttribution(wallet: string | null): () => void {
  let active = true;
  const handle = async (url?: string | null) => {
    if (url) await captureAffiliateUrl(url);
    if (active && wallet) await attributePendingReferral(wallet);
  };
  const subscription = Linking.addEventListener('url', ({ url }) => { void handle(url).catch(() => undefined); });
  void Linking.getInitialURL().then(handle).catch(() => undefined);
  return () => { active = false; subscription.remove(); };
}
