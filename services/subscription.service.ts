import { apiClient } from "../libs";

/**
 * Creator subscription plans.
 *
 * Every read here unwrapped a `{ result }` envelope or a bare array. The API
 * returns neither — it answers `{ plans }` and `{ subscription }` — so each
 * call fell through to its empty-array fallback and returned `[]` no matter
 * what the server said. Plans have therefore never appeared on a profile in
 * the app. `unwrap` reads the real keys, and still tolerates `result` so a
 * future shape change does not silently empty the UI again.
 */

export interface SubscriptionPlanChain {
  chainId: number;
  token: string;
  price: number;
  isPublished?: boolean;
  status?: boolean;
}

export interface SubscriptionPlan {
  _id?: string;
  id?: string;
  address?: string;
  creatorAddress?: string;
  name: string;
  description?: string;
  /** Headline price, mirrored from the primary chain entry. */
  price?: number;
  currency?: string;
  /** Whole months. 0 is lifetime — see normaliseDuration below. */
  duration: number;
  tier?: number;
  benefits?: string[];
  chains?: SubscriptionPlanChain[];
  chainId?: number;
  token?: string;
  /** True once the creator has listed the plan on chain and it can be bought. */
  isPublished?: boolean;
  isLifetime?: boolean;
  durationLabel?: string;
  isActive?: boolean;
  subscriberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subscription {
  _id?: string;
  id?: string;
  planId: string;
  plan?: SubscriptionPlan;
  subscriberAddress: string;
  creatorAddress: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isLifetime?: boolean;
  chainId?: number;
  autoRenew?: boolean;
  transactionHash?: string;
  createdAt?: string;
}

/** Intent returned by `/plan/buy` — everything the on-chain call needs. */
export interface SubscriptionIntent {
  id: string;
  planId: string;
  creatorAddress: string;
  subscriberAddress: string;
  duration: number;
  chainId: number;
  token: string;
  price: number;
  currency: string;
}

// ── Duration ────────────────────────────────────────────────────────────
//
// Whole months, 0–12, where **0 is lifetime**. The range is the contract's,
// not ours: `buySubscription` reverts with "Duration should be between 0 to 12
// (0 for lifetime)" outside it. This file used to count days (30/90/180/365),
// so every plan the app created was one the contract would refuse to sell.

export const LIFETIME_DURATION = 0;
export const MAX_DURATION_MONTHS = 12;

export function normaliseDuration(duration: unknown): number | null {
  const n = Number(duration);
  if (!Number.isInteger(n)) return null;
  if (n === 999) return LIFETIME_DURATION; // legacy lifetime value
  if (n < 0 || n > MAX_DURATION_MONTHS) return null;
  return n;
}

export function formatDuration(duration: number): string {
  const n = normaliseDuration(duration);
  if (n === null) return `${duration} months`;
  if (n === LIFETIME_DURATION) return "lifetime";
  if (n === 1) return "1 month";
  if (n === 12) return "1 year";
  return `${n} months`;
}

// ── Shape helpers ───────────────────────────────────────────────────────

type Envelope<T> = Record<string, unknown> | T;

function unwrap<T>(response: Envelope<T>, ...keys: string[]): T | undefined {
  if (response === null || response === undefined) return undefined;
  if (Array.isArray(response)) return response as unknown as T;
  if (typeof response !== "object") return response as T;
  const obj = response as Record<string, unknown>;
  for (const key of [...keys, "result", "data"]) {
    if (key in obj && obj[key] !== undefined && obj[key] !== null) return obj[key] as T;
  }
  return undefined;
}

/** The chain entry a purchase should target — prefer one actually published. */
export function primaryPlanChain(plan: SubscriptionPlan): SubscriptionPlanChain | undefined {
  const chains = plan.chains || [];
  return chains.find(c => c.isPublished) || chains[0];
}

export function planPrice(plan: SubscriptionPlan): number | undefined {
  if (typeof plan.price === "number") return plan.price;
  return primaryPlanChain(plan)?.price;
}

export function isPlanPublished(plan: SubscriptionPlan): boolean {
  if (typeof plan.isPublished === "boolean") return plan.isPublished;
  return (plan.chains || []).some(c => c.isPublished);
}

// ── API ─────────────────────────────────────────────────────────────────

export async function getPlans(creatorAddress?: string): Promise<SubscriptionPlan[]> {
  // Lowercased: plan addresses are stored lowercased, so a checksummed
  // address matches nothing.
  const queryParams = creatorAddress
    ? `?creator=${encodeURIComponent(creatorAddress.toLowerCase())}`
    : "";
  const res = await apiClient.get<Envelope<SubscriptionPlan[]>>(`/plans${queryParams}`);
  return unwrap<SubscriptionPlan[]>(res, "plans") || [];
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  const res = await apiClient.get<Envelope<Subscription[]>>("/subscription/me");
  return unwrap<Subscription[]>(res, "subscription", "subscriptions") || [];
}

export async function createPlan(planData: {
  name: string;
  description?: string;
  duration: number;
  tier: number;
  benefits?: string[];
  chains: { chainId: number; token: string; price: number }[];
}): Promise<SubscriptionPlan | undefined> {
  const res = await apiClient.post<Envelope<SubscriptionPlan>>("/plans", planData);
  return unwrap<SubscriptionPlan>(res, "plan");
}

export async function updatePlan(
  planId: string,
  planData: Partial<{
    name: string;
    description: string;
    price: number;
    duration: number;
    benefits: string[];
    chains: { chainId: number; token: string; price: number }[];
  }>,
): Promise<SubscriptionPlan | undefined> {
  const res = await apiClient.post<Envelope<SubscriptionPlan>>(`/plans/${planId}`, planData);
  return unwrap<SubscriptionPlan>(res, "plan");
}

/**
 * Reserve the row a purchase settles against.
 *
 * This does **not** subscribe anyone — it returns an inactive intent. Only an
 * on-chain purchase followed by `confirmSubscriptionPurchase` activates it.
 * The card used to call this and toast "Subscribed successfully", which is why
 * the flow looked complete while never taking a payment.
 */
export async function buyPlan(
  planId: string,
  chainId?: number,
): Promise<SubscriptionIntent | undefined> {
  const res = await apiClient.post<Envelope<SubscriptionIntent>>("/plan/buy", {
    planId,
    ...(chainId ? { chainId } : {}),
  });
  return unwrap<SubscriptionIntent>(res, "data", "subscription");
}

/** Tell the API a plan is now listed on chain, so it can verify and publish it. */
export async function confirmPlanPublished(planId: string, chainId: number): Promise<void> {
  await apiClient.post("/plan/webhook/create", { planId, chainId, isSuccess: true });
}

/** Tell the API a purchase landed, so it can verify it against the chain. */
export async function confirmSubscriptionPurchase(
  subId: string,
  hash: string,
  chainId: number,
): Promise<void> {
  await apiClient.post("/plan/webhook/purchased", { subId, hash, chainId, isSuccess: true });
}
