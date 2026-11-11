/**
 * Two-step sign-in, app half (same shape as the website's lib/two-factor-login).
 *
 * Every login ends in /mobile/auth or /web/auth/supabase. When the account has
 * two-step sign-in on, the API answers that request with TWO_FACTOR_REQUIRED
 * and a short challenge instead of a session. apiClient hands the challenge
 * here, TwoFactorPromptHost shows the code step on the login clip wall, and the
 * code is traded for the session the login was waiting for — so every caller
 * gets a normal session response and none of them had to learn about 2FA.
 */
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

export const TWO_FACTOR_REQUIRED_CODE = 'TWO_FACTOR_REQUIRED';

export const TWO_FACTOR_LOGIN_ENDPOINTS = ['/mobile/auth', '/web/auth/supabase'] as const;

export interface TwoFactorAccount {
  address?: string;
  username?: string | null;
  displayName?: string | null;
  avatarImageUrl?: string | null;
}

export interface TwoFactorPrompt {
  account: TwoFactorAccount;
  /** Resolves when the code was accepted; rejects with the server's message. */
  submit: (input: { code?: string; backupCode?: string; trustDevice: boolean }) => Promise<void>;
  cancel: () => void;
}

/**
 * Closing the code step. Carries the same code as a declined wallet prompt so
 * every login path already treats it as "the user backed out", not a failure.
 */
export class TwoFactorCancelledError extends Error {
  readonly code = 'ACTION_REJECTED';
  constructor() {
    super('Sign-in cancelled');
    this.name = 'TwoFactorCancelledError';
  }
}

let current: TwoFactorPrompt | null = null;
const listeners = new Set<() => void>();

function set(next: TwoFactorPrompt | null) {
  current = next;
  listeners.forEach((l) => l());
}

export function getTwoFactorPrompt() {
  return current;
}

export function useTwoFactorPrompt(): TwoFactorPrompt | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

// ── Trusted device tokens ("don't ask again for 30 days") ─────────────────

const TRUST_KEY = 'riftn_2fa_trust';

export async function readTrustTokens(): Promise<string[]> {
  try {
    const parsed = JSON.parse((await SecureStore.getItemAsync(TRUST_KEY)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

async function saveTrustToken(token: string) {
  try {
    const next = [token, ...(await readTrustTokens()).filter((t) => t !== token)].slice(0, 8);
    await SecureStore.setItemAsync(TRUST_KEY, JSON.stringify(next));
  } catch {
    /* the code is simply asked again next time */
  }
}

/** The challenge a TWO_FACTOR_REQUIRED refusal carries, or null for any other error. */
export function twoFactorChallengeOf(error: unknown): { challenge: string; account?: TwoFactorAccount } | null {
  const e = error as { code?: string; body?: { challenge?: unknown; account?: TwoFactorAccount } } | null;
  if (e?.code !== TWO_FACTOR_REQUIRED_CODE || typeof e.body?.challenge !== 'string') return null;
  return { challenge: e.body.challenge, account: e.body.account };
}

/**
 * Show the code step and wait. Resolves with the verify response (a normal
 * session response), or rejects with TwoFactorCancelledError.
 */
export function awaitTwoFactorCode<T>(
  challenge: { challenge: string; account?: TwoFactorAccount },
  verify: (body: { challenge: string; code?: string; backupCode?: string; trustDevice: boolean }) => Promise<T>,
): Promise<T> {
  current?.cancel();
  return new Promise<T>((resolve, reject) => {
    const prompt: TwoFactorPrompt = {
      account: challenge.account || {},
      submit: async ({ code, backupCode, trustDevice }) => {
        let data: T;
        try {
          data = await verify({ challenge: challenge.challenge, code, backupCode, trustDevice });
        } catch (error: any) {
          // An expired or used-up challenge can't be retried: end this login.
          if (error?.status === 400 && /expired/i.test(error?.message || '')) {
            if (current === prompt) set(null);
            reject(error);
          }
          throw error;
        }
        const trust = (data as { twoFactorTrust?: unknown } | null)?.twoFactorTrust;
        if (typeof trust === 'string') await saveTrustToken(trust);
        if (current === prompt) set(null);
        resolve(data);
      },
      cancel: () => {
        if (current === prompt) set(null);
        reject(new TwoFactorCancelledError());
      },
    };
    set(prompt);
  });
}
