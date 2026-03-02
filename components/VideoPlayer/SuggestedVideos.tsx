import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";
import VideoPlayerSkeleton from "./VideoPlayerSkeleton";
import CompactVideoCard from "../Home/CompactVideoCard";
import { GetNFTsResult, getSuggestedVideos } from "../../services";

export interface SuggestedVideosHandle {
  loadMore: () => void;
}

interface SuggestedVideosProps {
  excludeTokenId?: string | number;
  title?: string;
  limit?: number;
  enablePreview?: boolean;
}

type SuggestedItem = GetNFTsResult & { __listKey: string };

const SuggestedVideos = forwardRef<SuggestedVideosHandle, SuggestedVideosProps>(
  (
    {
      excludeTokenId,
      title = "Suggested",
      limit = 20,
      enablePreview = true,
    },
    ref
  ) => {
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [items, setItems] = useState<SuggestedItem[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const currentPageRef = useRef(1);
    const requestKeyRef = useRef(0);
    const inFlightRef = useRef(false);

    const makeKey = useCallback(
      (it: GetNFTsResult, p: number, idx: number) => {
        const base = (it as any).tokenId || (it as any).id || `auto`;
        return `${base}-p${p}-i${idx}`;
      },
      []
    );

    const tokenId = excludeTokenId;

    const loadFirstPage = useCallback(async () => {
      if (tokenId == null) {
        setInitialLoading(false);
        return;
      }
      const requestKey = ++requestKeyRef.current;
      currentPageRef.current = 1;
      setItems([]);
      setHasMore(true);
      setInitialLoading(true);
      try {
        const res = await getSuggestedVideos(tokenId, { page: 1, limit });
        if (requestKey !== requestKeyRef.current) return;
        const list = Array.isArray(res?.result) ? res.result : [];
        const mapped: SuggestedItem[] = list.map((it, idx) => ({
          ...it,
          __listKey: makeKey(it, 1, idx),
        }));
        setItems(mapped);
        setHasMore(res?.pagination?.hasMore ?? list.length >= limit);
      } catch (e) {
        if (requestKey !== requestKeyRef.current) return;
        setItems([]);
        console.warn("[SuggestedVideos] fetch failed", e);
      } finally {
        if (requestKey === requestKeyRef.current) setInitialLoading(false);
      }
    }, [makeKey, tokenId, limit]);

    const loadMore = useCallback(async () => {
      if (initialLoading || loadingMore || !hasMore || inFlightRef.current) return;
      if (tokenId == null) return;

      const requestKey = requestKeyRef.current;
      const nextPage = currentPageRef.current + 1;
      inFlightRef.current = true;
      setLoadingMore(true);
      try {
        const res = await getSuggestedVideos(tokenId, { page: nextPage, limit });
        if (requestKey !== requestKeyRef.current) return;
        const list = Array.isArray(res?.result) ? res.result : [];
        const mapped: SuggestedItem[] = list.map((it, idx) => ({
          ...it,
          __listKey: makeKey(it, nextPage, idx),
        }));
        currentPageRef.current = nextPage;
        setItems((prev) => [...prev, ...mapped]);
        setHasMore(res?.pagination?.hasMore ?? list.length >= limit);
      } catch {
        // Keep existing items; allow future retries
      } finally {
        inFlightRef.current = false;
        if (requestKey === requestKeyRef.current) setLoadingMore(false);
      }
    }, [initialLoading, loadingMore, hasMore, makeKey, tokenId, limit]);

    useImperativeHandle(ref, () => ({ loadMore }), [loadMore]);

    useEffect(() => {
      loadFirstPage();
    }, [loadFirstPage]);

    if (initialLoading) {
      return (
        <View className="mt-6">
          <VideoPlayerSkeleton variant="suggestions" suggestionCount={6} />
        </View>
      );
    }
    if (!initialLoading && items.length === 0) return null;

    return (
      <View className="mt-6">
        <Text className="text-theme-neutrals-100 font-semibold mb-3 text-sm px-4">
          {title}
        </Text>
        {items.map((item) => (
          <CompactVideoCard
            key={item.__listKey}
            nft={item as any}
            enablePreview={enablePreview}
          />
        ))}
        {loadingMore && (
          <View className="px-4 py-4">
            <ActivityIndicator />
          </View>
        )}
      </View>
    );
  }
);

SuggestedVideos.displayName = "SuggestedVideos";

export default SuggestedVideos;
