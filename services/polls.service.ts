import { apiClient } from "../libs/api.client";
import type { DmPoll } from "./dm/dm.types";

export interface CreatePollParams {
  tokenId: number;
  question: string;
  options: string[];
  expiresAt?: string;
  isMultipleChoice?: boolean;
}

export async function createPoll(
  params: CreatePollParams,
): Promise<{ status: boolean; result: DmPoll }> {
  return apiClient.post("/poll", params, { isAuthRequired: true });
}

export async function getPoll(
  tokenId: number,
): Promise<{ status: boolean; result: DmPoll }> {
  return apiClient.get(`/poll/${tokenId}`);
}

/** Upper bound the API enforces on one batch lookup. */
export const POLL_BATCH_LIMIT = 50;

/**
 * Polls for a whole page of posts, keyed by tokenId.
 *
 * Ids with no poll are absent from the result rather than reported — which is
 * the answer the caller needs, and a permanent one, since a poll can only be
 * attached when a post is created.
 */
export async function getPolls(
  tokenIds: number[],
): Promise<{ status: boolean; result: Record<string, DmPoll> }> {
  return apiClient.get(`/polls?tokenIds=${tokenIds.join(",")}`);
}

export async function voteOnPoll(
  tokenId: number,
  optionIndexes: number[],
): Promise<{ status: boolean; result: DmPoll }> {
  return apiClient.post(
    `/poll/${tokenId}/vote`,
    { optionIndexes },
    { isAuthRequired: true },
  );
}

export async function removePollVote(
  tokenId: number,
): Promise<{ status: boolean }> {
  return apiClient.delete(`/poll/${tokenId}/vote`, { isAuthRequired: true });
}

export async function closePoll(
  tokenId: number,
): Promise<{ status: boolean }> {
  return apiClient.post(`/poll/${tokenId}/close`, undefined, {
    isAuthRequired: true,
  });
}
