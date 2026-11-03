/**
 * Hype trains on the stream API (web: src/lib/api/dehub/live-hype.ts). Gifts
 * and subscriptions are counted on the server, so every screen shows the same
 * level and countdown.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "../libs/api.client";

export interface HypeTrain {
  streamId: string;
  active: boolean;
  level: number;
  completed: number;
  into: number;
  need: number;
  expiresAt: string;
  contributors: number;
  top: Array<{ username?: string; displayName?: string; address?: string; points: number }>;
  ended: boolean;
  levelUp: boolean;
}

export function parseHypeTrain(raw: any): HypeTrain | null {
  if (!raw || typeof raw !== "object" || !raw.streamId) return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    streamId: String(raw.streamId),
    active: !!raw.active,
    level: Math.max(1, n(raw.level)),
    completed: n(raw.completed),
    into: n(raw.into),
    need: Math.max(1, n(raw.need)),
    expiresAt: String(raw.expiresAt || ""),
    contributors: n(raw.contributors),
    top: Array.isArray(raw.top)
      ? raw.top.slice(0, 3).map((u: any) => ({
        username: u?.username || u?.user?.username,
        displayName: u?.displayName || u?.user?.displayName,
        address: u?.address || u?.walletAddress || u?.user?.address,
        points: n(u?.points),
      }))
      : [],
    ended: !!raw.ended,
    levelUp: !!raw.levelUp,
  };
}

export async function getHypeTrain(streamId: string): Promise<HypeTrain | null> {
  if (!streamId) return null;
  const res: any = await apiClient.get<any>(`/live-hype/stream/${encodeURIComponent(streamId)}`);
  const body = res?.data ?? res;
  return parseHypeTrain((body?.result ?? body)?.train);
}

// ─── Gifted subscriptions ─────────────────────────────────────────────────────


export interface GiftQuote {
  giftId: string;
  mode: "user" | "random";
  /** How many the checkout buys: fewer than asked when fewer chatters can receive one. */
  count: number;
  requested: number;
  chainId: number;
  dhbToken: string;
  treasuryAddress: string;
  dhbAmountWei: string;
}

export interface GiftResult { giftId: string; status: string; count: number; granted: number }

export type GiftTarget = { recipient: string } | { count: number; streamId: string };

const unwrap = (res: any) => {
  const body = res?.data ?? res;
  return body && typeof body === "object" && "result" in body ? body.result : body;
};

/** The API fixes the recipients and the price; nothing is granted until the transfer is confirmed. */
export async function quoteSubscriptionGift(planId: string, target: GiftTarget): Promise<GiftQuote> {
  const res: any = unwrap(await apiClient.post<any>("/plan/gift", { planId, ...target }, { isAuthRequired: true }));
  if (res?.error) throw new Error(String(res.msg || res.message || res.error));
  return {
    giftId: String(res?.giftId ?? ""),
    mode: res?.mode === "user" ? "user" : "random",
    count: Number(res?.count) || 0,
    requested: Number(res?.requested) || Number(res?.count) || 0,
    chainId: Number(res?.chainId) || 8453,
    dhbToken: String(res?.dhbToken ?? ""),
    treasuryAddress: String(res?.treasuryAddress ?? ""),
    dhbAmountWei: String(res?.dhbAmountWei ?? ""),
  };
}

export async function confirmSubscriptionGift(giftId: string, hash: string, chainId: number): Promise<GiftResult> {
  const res: any = unwrap(await apiClient.post<any>("/plan/gift/confirm", { giftId, hash, chainId }, { isAuthRequired: true }));
  if (res?.error) throw new Error(String(res.msg || res.message || res.error));
  return { giftId: String(res?.giftId ?? giftId), status: String(res?.status ?? "granted"), count: Number(res?.count) || 0, granted: Number(res?.granted) || 0 };
}

interface PendingGiftPayment { giftId: string; hash: string; chainId: number }
const PENDING_GIFTS_KEY = "dehub.pending-gift-payments.v1";

async function pendingGifts(): Promise<PendingGiftPayment[]> {
  try {
    const stored = JSON.parse((await AsyncStorage.getItem(PENDING_GIFTS_KEY)) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

async function storePendingGifts(list: PendingGiftPayment[]) {
  try {
    if (list.length) await AsyncStorage.setItem(PENDING_GIFTS_KEY, JSON.stringify(list));
    else await AsyncStorage.removeItem(PENDING_GIFTS_KEY);
  } catch {}
}

export async function rememberPendingGift(payment: PendingGiftPayment) {
  await storePendingGifts([...(await pendingGifts()).filter((p) => p.giftId !== payment.giftId), payment]);
}

export async function clearPendingGift(giftId: string) {
  await storePendingGifts((await pendingGifts()).filter((p) => p.giftId !== giftId));
}

/** Finish a gift whose transfer went through while its confirmation did not. A paid gift never asks to pay twice. */
export async function reconcilePendingGifts(): Promise<void> {
  for (const p of await pendingGifts()) {
    try {
      await confirmSubscriptionGift(p.giftId, p.hash, p.chainId);
      await clearPendingGift(p.giftId);
    } catch {
      // Kept for the next try.
    }
  }
}
