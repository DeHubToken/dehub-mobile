/**
 * Which chain the app starts on when the user has not picked one.
 *
 * BNB Chain for everyone, with one exception: a wallet that already held
 * tokens on Base when we first looked keeps Base. Decided once per wallet and
 * then kept. An explicit pick in Settings always wins. Same storage key and
 * value shape as web (src/lib/chains/default-chain.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_CHAIN = 8453;
export const BNB_CHAIN = 56;
export const NEW_USER_DEFAULT_CHAIN = BNB_CHAIN;
const KEY = 'dehub_default_chain';

let decided: Record<string, number> = {};
let loaded: Promise<void> | null = null;
let activeWallet: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => { try { l(); } catch { /* keep going */ } });
}

export function loadDefaultChains(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const parsed = JSON.parse(raw || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) decided = { ...parsed, ...decided };
      })
      .catch(() => { /* stays on the new-user default */ })
      .then(() => emit());
  }
  return loaded;
}

export function subscribeDefaultChain(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getDecidedDefaultChain(wallet: string | null | undefined): number | null {
  if (!wallet) return null;
  const value = Number(decided[wallet.toLowerCase()]);
  return value === BASE_CHAIN || value === BNB_CHAIN ? value : null;
}

export function setDefaultChainWallet(wallet: string | null | undefined) {
  const next = wallet ? wallet.toLowerCase() : null;
  if (next === activeWallet) return;
  activeWallet = next;
  emit();
}

export function getDefaultChainId(): number {
  return getDecidedDefaultChain(activeWallet) ?? NEW_USER_DEFAULT_CHAIN;
}

/** Decide from a Base token read (balance strings, null = unread). */
export function decideDefaultChain(
  wallet: string,
  baseTokens: ReadonlyArray<{ balance: string | null }>,
): number | null {
  const existing = getDecidedDefaultChain(wallet);
  if (existing) return existing;
  const holdsBase = baseTokens.some((t) => t.balance != null && Number(t.balance) > 0);
  if (!holdsBase && baseTokens.some((t) => t.balance == null)) return null;
  const chain = holdsBase ? BASE_CHAIN : BNB_CHAIN;
  decided = { ...decided, [wallet.toLowerCase()]: chain };
  AsyncStorage.setItem(KEY, JSON.stringify(decided)).catch(() => { /* best effort */ });
  emit();
  return chain;
}
