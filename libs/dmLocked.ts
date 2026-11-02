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
