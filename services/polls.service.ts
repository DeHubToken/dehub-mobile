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
