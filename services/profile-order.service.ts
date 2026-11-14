import { apiClient } from "../libs/api.client";

/** The most posts one saved order may hold (the API enforces the same). */
export const PROFILE_ORDER_MAX = 1000;

/**
 * Save the signed-in creator's own order for the posts on their profile,
 * first shown first. An empty list goes back to newest first.
 */
export function saveProfileOrder(order: number[]): Promise<{ status: boolean; count: number; profileOrderAt: string | null }> {
  return apiClient.put("/profile-order", { order }, { isAuthRequired: true });
}
