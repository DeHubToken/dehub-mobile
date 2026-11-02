/**
 * Pay-to-unlock DM media: the bits the bubble needs that live outside it.
 *
 * The chat screen owns the wallet (contracts, chain, approvals), so it
 * registers the payer here, the same way it hands the send queue its fee
 * payer. The bubble calls `payForLockedMedia`, which tips the other person in
 * the chat (the sender of the locked photo) and returns the tx hash.
 */
import env from "../config/env";

type Payer = (amount: number) => Promise<string>;
let payer: Payer | null = null;

export function setLockedMediaPayer(fn: Payer | null) {
  payer = fn;
}

export async function payForLockedMedia(amount: number): Promise<string> {
  if (!payer) throw new Error("Open the chat to pay.");
  return payer(amount);
}

export const lockedMediaKey = (messageId: string) => ["dm-locked", messageId] as const;

/** Absolute URLs (signed links) pass through; CDN keys get the CDN base. */
export function lockedMediaUri(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|file:|content:|data:|ph:|assets-library:)/i.test(path)) return path;
  return `${env.CDN_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

/** Where an iPhone user pays: the same chat on the website. */
export const LOCKED_MEDIA_WEB_URL = "https://dehub.io/app/messages";

// ─── Dollar prices ────────────────────────────────────────────────────────
// Locked media is priced in USD, like subscriptions. The buyer pays that many
// dollars in DHB at the live rate; the server works out the live DHB
// (`lock.price` on every read). These cover the composer and old locks.

/** Fixed DHB sale price while trading is paused (backend dehub-pay/peg.ts). */
export const DHB_PRELISTING_USD = 0.001;
export const LOCK_QUICK_USD = [1, 5, 10];
export const LOCK_DEFAULT_USD = 5;
export const LOCK_MIN_USD = 0.1;
export const LOCK_MAX_USD = 10_000;

/** "$5" or "$2.50". */
export function formatLockUsd(usd: number): string {
  const whole = Math.abs(usd - Math.round(usd)) < 0.005;
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** DHB for a dollar price, rounded up to two decimals. */
export function lockDhbForUsd(usd: number, rate = DHB_PRELISTING_USD): number {
  if (!(usd > 0) || !(rate > 0)) return 0;
  return Math.ceil((usd / rate) * 100) / 100;
}

export function formatLockDhb(dhb: number): string {
  return `${dhb.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB`;
}

/** The lock's USD price; locks made before dollar pricing were set at the fixed DHB price. */
export function lockUsdOf(lock: { price: number; priceUsd?: number }): number {
  return lock.priceUsd && lock.priceUsd > 0 ? lock.priceUsd : lock.price * DHB_PRELISTING_USD;
}
