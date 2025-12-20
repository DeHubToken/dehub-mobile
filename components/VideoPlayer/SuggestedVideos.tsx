import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, Text, View } from "react-native";
import VideoPlayerSkeleton from "./VideoPlayerSkeleton";
import CompactVideoCard from "../Home/CompactVideoCard";
import { GetNFTsResult, getNFTs } from "../../services";

export interface SuggestedVideosHandle {
  loadMore: () => void;
}

interface SuggestedVideosProps {
  excludeTokenId?: string | number;
  title?: string;
  sortMode?: string;
  unit?: number;
  enablePreview?: boolean;
}

type SuggestedItem = GetNFTsResult & { __listKey: string };

const SuggestedVideos = forwardRef<SuggestedVideosHandle, SuggestedVideosProps>(
  (
    {
      excludeTokenId,
      title = "Suggested",
      sortMode = "trends",
      unit = 10,
      enablePreview = true,
    },
    ref
  ) => {
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [items, setItems] = useState<SuggestedItem[]>([]);
    const currentPageRef = useRef(0);
    const endReachedRef = useRef(false);
    const requestKeyRef = useRef(0);
    const inFlightPagesRef = useRef<Set<number>>(new Set());
    const loadedPagesRef = useRef<Set<number>>(new Set());

    const makeKey = useCallback(
      (it: GetNFTsResult, p: number, idx: number) => {
        const base =
          (it as any).tokenId ||
          (it as any).id ||
          (it as any).nftId ||
          (it as any).streamKey ||
          (it as any).stream?.id ||
          (it as any).stream?.streamKey ||
          `auto`;
        const created =
          (it as any).createdAt ||
          (it as any).stream?.createdAt ||
          (it as any).created_at ||
          `nocreated`;
        return `${base}-${created}-p${p}-i${idx}`;
      },
      []
    );

    const loadFirstPage = useCallback(async () => {
      const requestKey = ++requestKeyRef.current;
      endReachedRef.current = false;
      currentPageRef.current = 0;
      inFlightPagesRef.current = new Set();
      loadedPagesRef.current = new Set();
      setItems([]);
      setInitialLoading(true);
      try {
        const targetPage = 0;
        inFlightPagesRef.current.add(targetPage);
        const res = await getNFTs({ sortMode, unit, page: targetPage });
        if (requestKey !== requestKeyRef.current) return;
        const list = Array.isArray(res?.result) ? res.result : [];
        const mapped: SuggestedItem[] = list.map((it, idx) => ({
          ...it,
          __listKey: makeKey(it, targetPage, idx),
        }));
        setItems(mapped);
        loadedPagesRef.current.add(targetPage);
        if (mapped.length < unit) endReachedRef.current = true;
      } catch (e) {
        if (requestKey !== requestKeyRef.current) return;
        setItems([]);
        console.warn("[SuggestedVideos] getNFTs failed", e);
      } finally {
        inFlightPagesRef.current.delete(0);
        if (requestKey === requestKeyRef.current) setInitialLoading(false);
      }
    }, [makeKey, sortMode, unit]);

    const loadMore = useCallback(async () => {
      if (initialLoading || loadingMore) return;
      if (endReachedRef.current) return;
      const requestKey = requestKeyRef.current;
      const nextPage = currentPageRef.current + 1;
      if (loadedPagesRef.current.has(nextPage)) return;
      if (inFlightPagesRef.current.has(nextPage)) return;

      inFlightPagesRef.current.add(nextPage);
      setLoadingMore(true);
      try {
        const res = await getNFTs({ sortMode, unit, page: nextPage });
        if (requestKey !== requestKeyRef.current) return;
        const list = Array.isArray(res?.result) ? res.result : [];
        const mapped: SuggestedItem[] = list.map((it, idx) => ({
          ...it,
          __listKey: makeKey(it, nextPage, idx),
        }));
        loadedPagesRef.current.add(nextPage);
        currentPageRef.current = nextPage;
        setItems((prev) => [...prev, ...mapped]);
        if (mapped.length < unit) endReachedRef.current = true;
      } catch (e) {
        // Keep existing items; allow future retries via scroll
      } finally {
        inFlightPagesRef.current.delete(nextPage);
        if (requestKey === requestKeyRef.current) setLoadingMore(false);
      }
    }, [initialLoading, loadingMore, makeKey, sortMode, unit]);

    useImperativeHandle(
      ref,
      () => ({
        loadMore,
      }),
      [loadMore]
    );

    useEffect(() => {
      loadFirstPage();
    }, [loadFirstPage]);

    const filtered = useMemo(() => {
      if (excludeTokenId == null) return items;
      const ex = String(excludeTokenId);
      return items.filter((it) => String(it.tokenId ?? it.id ?? "") !== ex);
    }, [items, excludeTokenId]);

    if (initialLoading) {
      return (
        <View className="mt-6">
          <VideoPlayerSkeleton variant="suggestions" suggestionCount={6} />
        </View>
      );
    }
    if (!initialLoading && filtered.length === 0) return null;

    return (
      <View className="mt-6">
        <Text className="text-theme-neutrals-100 font-semibold mb-3 text-sm px-4">
          {title}
        </Text>
        {filtered.map((item) => (
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
