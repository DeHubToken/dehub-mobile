import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getNFT } from "../services/nft.service";

export type VideoProcessingStatus = "pending" | "on" | "done" | "failed";
const POLL_MS = 5_000;
const processingKey = (tokenId: number | string | undefined) => ["video-processing", String(tokenId)] as const;
const isPending = (status: VideoProcessingStatus | undefined) => status === "pending" || status === "on";

export function markVideoProcessing(client: QueryClient, tokenId: number | string) {
  client.setQueryData(processingKey(tokenId), "pending");
}

/** Follow only visible, unfinished videos. A shared key keeps duplicate cards
 * on the same status without refreshing the feed or moving its scroll position. */
export function useVideoProcessingStatus(
  tokenId: number | string | undefined,
  initialStatus: VideoProcessingStatus | undefined,
  visible: boolean,
) {
  const client = useQueryClient();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  const key = processingKey(tokenId);
  const canFollow = isPending(initialStatus) || initialStatus === "failed";
  const cached = client.getQueryData<VideoProcessingStatus>(key);
  const active = tokenId != null && visible && foreground && canFollow && isPending(cached ?? initialStatus);
  const query = useQuery<VideoProcessingStatus>({
    queryKey: key,
    queryFn: async () => {
      const { result } = await getNFT(tokenId!);
      const status = result.transcodingStatus;
      if (!["pending", "on", "done", "failed"].includes(status)) throw new Error("Missing video processing status");
      return status as VideoProcessingStatus;
    },
    enabled: active,
    staleTime: POLL_MS,
    refetchInterval: q => active && isPending(q.state.data ?? initialStatus) ? POLL_MS : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return canFollow ? query.data ?? initialStatus : initialStatus;
}
