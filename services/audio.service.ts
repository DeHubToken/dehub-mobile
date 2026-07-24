import { apiClient } from "../libs";

interface RecordListenResponse {
  success: boolean;
  isNewListen: boolean;
  listens: number;
  rateLimited?: boolean;
}

/** Record an audio post listen. Returns updated listen count. */
export async function recordListen(tokenId: string): Promise<RecordListenResponse> {
  return apiClient.get<RecordListenResponse>(`/record-listen/${tokenId}`);
}
