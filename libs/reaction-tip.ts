/** One reaction hint per account, shared with the web app. */
import i18n from 'i18next';
import { storage } from './storage';
import { toastInfo } from './toast';
import { supabase } from '../services/supabase';
import { withWalletHeader } from './supabase-wallet-client';

const LEGACY_KEY = 'dehub:reaction-tip-seen';
const seen = new Set<string>();
const attempted = new Set<string>();
const claims = new Map<string, Promise<boolean>>();
const keyFor = (wallet: string) => `${LEGACY_KEY}:${wallet}`;

function storedSeen(wallet: string): boolean {
  try {
    return storage.getBoolean(keyFor(wallet)) === true || storage.getBoolean(LEGACY_KEY) === true;
  } catch { return false; }
}

function remember(wallet: string): void {
  seen.add(wallet);
  try {
    storage.set(keyFor(wallet), true);
    storage.delete(LEGACY_KEY);
  } catch { /* the session guard still prevents repeats */ }
}

function claim(wallet: string): Promise<boolean> {
  let pending = claims.get(wallet);
  if (!pending) {
    pending = (async () => {
      try {
        const { data, error } = await withWalletHeader(supabase.rpc('claim_reaction_tip'), wallet);
        // An unavailable server cannot establish that this person needs a hint.
        return !error && data === true;
      } catch { return false; }
    })();
    claims.set(wallet, pending);
  }
  return pending;
}

export function markReactionTipSeen(walletAddress?: string | null): void {
  const wallet = walletAddress?.toLowerCase();
  if (!wallet) {
    try { storage.set(LEGACY_KEY, true); } catch { /* storage blocked */ }
    return;
  }
  remember(wallet);
  void claim(wallet);
}

export async function maybeShowReactionTip(walletAddress?: string | null): Promise<void> {
  const wallet = walletAddress?.toLowerCase();
  if (!wallet) return;
  if (seen.has(wallet) || storedSeen(wallet)) {
    markReactionTipSeen(wallet);
    return;
  }
  if (attempted.has(wallet)) return;
  attempted.add(wallet);
  const first = await claim(wallet);
  // Opening any picker while this request was pending also teaches the gesture.
  if (seen.has(wallet)) return;
  remember(wallet);
  if (first) toastInfo(i18n.t('feedCard.reactionTip'), { duration: 5000 });
}
