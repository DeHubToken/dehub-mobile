import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "../libs/api.client";

/**
 * Subscription tokens: a dollar balance held by DeHub, shown as tokens at
 * today's price and spent on AI generation. AI plans grant it; anyone can add
 * to it. It cannot be withdrawn, sent or traded.
 */

export interface SubscriptionCreditBalance {
  /** The dollar balance at today's price. Moves with the price; `usd` does not. */
  tokens: number;
  usd: number;
  /** Lifetime dollars added and spent. Absent from older API builds. */
  totalAddedUsd?: number;
  totalSpentUsd?: number;
  dhbPriceUsd: number;
  withdrawable: false;
  tradable: false;
  message: string;
}

/**
 * `address` is the signed-in wallet: pending top-ups are only retried for
 * the account that sent them.
 */
export async function getSubscriptionCredits(address?: string | null): Promise<SubscriptionCreditBalance | null> {
  if (address) await reconcilePendingCreditTopUps(address);
  const res = await apiClient.get<{ credits?: SubscriptionCreditBalance }>("/subscription-credits");
  return res?.credits ?? null;
}

/** Where a subscription-token top-up is sent on `chainId`. */
export async function getSubscriptionCreditTopUpTarget(
  chainId: number,
): Promise<{ chainId: number; dhbToken: string; treasuryAddress: string }> {
  const res = await apiClient.get<{ topUp?: { chainId: number; dhbToken: string; treasuryAddress: string } }>(
    `/subscription-credits?chainId=${chainId}`,
  );
  if (!res?.topUp?.dhbToken || !res.topUp.treasuryAddress) {
    throw new Error("Top-ups are not available right now. Try again shortly.");
  }
  return res.topUp;
}

/**
 * Turn a mined DHB transfer into subscription tokens. The API values it at the
 * price when it landed. `pending` means the chain has not caught up; ask again.
 */
export async function claimSubscriptionCreditTopUp(
  hash: string,
  chainId: number,
): Promise<{ credited: boolean; pending?: boolean }> {
  return apiClient.post<{ credited: boolean; pending?: boolean }>("/subscription-credits/topup", { hash, chainId });
}

// A top-up is a transfer and then a claim. If the claim is interrupted the
// DHB has already left the wallet, so the hash is kept until the API has
// credited it — never dropped on a network error, only on a final answer.
const PENDING_CREDIT_TOPUPS_KEY = "dehub.pending-credit-topups.v1";

interface PendingCreditTopUp {
  hash: string;
  chainId: number;
  /** The account that sent it. Another profile on this device must never claim it. */
  address: string;
  /** When it was sent. A hash still unresolved after a week is given up on. */
  at: number;
}

const PENDING_TOPUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function pendingCreditTopUps(): Promise<PendingCreditTopUp[]> {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(PENDING_CREDIT_TOPUPS_KEY)) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

async function storePendingCreditTopUps(items: PendingCreditTopUp[]): Promise<void> {
  try {
    if (items.length) await AsyncStorage.setItem(PENDING_CREDIT_TOPUPS_KEY, JSON.stringify(items));
    else await AsyncStorage.removeItem(PENDING_CREDIT_TOPUPS_KEY);
  } catch {
    /* storage unavailable: the claim still ran once in the foreground */
  }
}

export async function rememberPendingCreditTopUp(item: Omit<PendingCreditTopUp, "at">): Promise<void> {
  const hash = item.hash.toLowerCase();
  const rest = (await pendingCreditTopUps()).filter((p) => p.hash.toLowerCase() !== hash);
  await storePendingCreditTopUps([...rest, { ...item, address: item.address.toLowerCase(), at: Date.now() }]);
}

export async function clearPendingCreditTopUp(hash: string): Promise<void> {
  const lower = hash.toLowerCase();
  await storePendingCreditTopUps((await pendingCreditTopUps()).filter((p) => p.hash.toLowerCase() !== lower));
}

/**
 * The API's final word on a hash: 400 (not a valid payment) or 409 (already
 * used). Anything else — rate limits, a proxy's 403/404, 5xx — is retried.
 */
export const FINAL_TOPUP_STATUSES = new Set([400, 409]);

async function reconcilePendingCreditTopUps(address: string): Promise<void> {
  const owner = address.toLowerCase();
  const now = Date.now();
  for (const item of await pendingCreditTopUps()) {
    if (!item.at || now - item.at > PENDING_TOPUP_MAX_AGE_MS) {
      await clearPendingCreditTopUp(item.hash);
      continue;
    }
    if ((item.address || "").toLowerCase() !== owner) continue;
    try {
      const result = await claimSubscriptionCreditTopUp(item.hash, item.chainId);
      if (!result?.pending) await clearPendingCreditTopUp(item.hash);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status && FINAL_TOPUP_STATUSES.has(status)) await clearPendingCreditTopUp(item.hash);
    }
  }
}
