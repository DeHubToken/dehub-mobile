/**
 * What the person said they came to do BEFORE signing in: bring over an old
 * (Web3Auth-era) DeHub account. Chosen from the "Migrate account" button on
 * the sign-in surfaces and read back once the identity exists.
 *
 * Detection is automatic either way — a sign-in that matches an old account
 * always lands on the recovery sheet. The intent only changes what happens
 * when NOTHING matches: instead of silently starting a new account, the
 * person is told the login has no earlier account behind it.
 *
 * Module state, not storage: every sign-in here completes in-process (the
 * OAuth legs run in an in-app browser), so nothing survives a relaunch and
 * nothing needs to.
 */
export type WalletSetupIntent = "migrate";

let current: WalletSetupIntent | null = null;

export function getWalletSetupIntent(): WalletSetupIntent | null {
  return current;
}

export function setWalletSetupIntent(intent: WalletSetupIntent | null): void {
  current = intent;
}

/** Reads and clears in one go — the intent is spent by the sign-in it applied to. */
export function takeWalletSetupIntent(): WalletSetupIntent | null {
  const value = current;
  current = null;
  return value;
}
