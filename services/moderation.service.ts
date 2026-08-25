import { apiClient } from "../libs";

/**
 * Appeals against moderation decisions.
 *
 * A removal or a warning arrives as a notification saying what happened and
 * why, and used to end by asking the creator to email support. An appeal now
 * attaches to that notification and becomes a tracked ticket with a reference
 * number and an answer that comes back.
 */

export interface AppealResult {
  ref: string;
  status: string;
  /** Set when this decision had already been appealed — the original's reference. */
  duplicateOf: string | null;
}

export interface Appeal {
  ref: string;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  /** What the reviewer wrote back, once there is one. */
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  tokenId: number | null;
}

export async function appealModerationDecision(params: {
  notificationId: string;
  reason: string;
}): Promise<AppealResult> {
  const res = await apiClient.post<any>("/moderation/appeal", params, {
    isAuthRequired: true,
  });
  return (res?.data ?? res) as AppealResult;
}

export async function getMyAppeals(): Promise<Appeal[]> {
  const res = await apiClient.get<any>("/moderation/appeals", { isAuthRequired: true });
  return (res?.data ?? []) as Appeal[];
}
