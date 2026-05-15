import { apiClient } from "../libs";

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
  price?: number;
  currency?: string;
  duration: number;
  tier?: number;
  benefits?: string[];
  chains?: SubscriptionPlanChain[];
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
  autoRenew?: boolean;
  transactionHash?: string;
  createdAt?: string;
}

export async function getPlans(creatorAddress?: string): Promise<SubscriptionPlan[]> {
  const queryParams = creatorAddress ? `?creator=${encodeURIComponent(creatorAddress)}` : "";
  const res = await apiClient.get<{ result: SubscriptionPlan[] } | SubscriptionPlan[]>(
    `/api/plans${queryParams}`,
  );
  if (res && typeof res === "object" && "result" in res) {
    return (res as { result: SubscriptionPlan[] }).result || [];
  }
  return Array.isArray(res) ? res : [];
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  const res = await apiClient.get<{ result: Subscription[] } | Subscription[]>(
    "/api/subscription/me",
  );
  if (res && typeof res === "object" && "result" in res) {
    return (res as { result: Subscription[] }).result || [];
  }
  return Array.isArray(res) ? res : [];
}

export async function createPlan(planData: {
  name: string;
  description?: string;
  duration: number;
  tier: number;
  benefits?: string[];
  chains: { chainId: number; token: string; price: number }[];
}): Promise<SubscriptionPlan> {
  const res = await apiClient.post<{ result: SubscriptionPlan } | SubscriptionPlan>(
    "/api/plans",
    planData,
  );
  if (res && typeof res === "object" && "result" in res) {
    return (res as { result: SubscriptionPlan }).result;
  }
  return res as SubscriptionPlan;
}

export async function updatePlan(
  planId: string,
  planData: Partial<{
    name: string;
    description: string;
    price: number;
    currency: string;
    duration: number;
    benefits: string[];
    isActive: boolean;
  }>,
): Promise<SubscriptionPlan> {
  const res = await apiClient.post<{ result: SubscriptionPlan } | SubscriptionPlan>(
    `/api/plans/${planId}`,
    planData,
  );
  if (res && typeof res === "object" && "result" in res) {
    return (res as { result: SubscriptionPlan }).result;
  }
  return res as SubscriptionPlan;
}

export async function buyPlan(planId: string): Promise<{ subscription: Subscription; transactionHash?: string }> {
  const res = await apiClient.post<{ result: { subscription: Subscription; transactionHash?: string } } | { subscription: Subscription; transactionHash?: string }>(
    "/api/plan/buy",
    { planId },
  );
  if (res && typeof res === "object" && "result" in res) {
    return (res as { result: { subscription: Subscription; transactionHash?: string } }).result;
  }
  return res as { subscription: Subscription; transactionHash?: string };
}
