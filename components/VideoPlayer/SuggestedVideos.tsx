import React, { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import VideoPlayerSkeleton from "./VideoPlayerSkeleton";
import CompactVideoCard from "../Home/CompactVideoCard";
import { GetNFTsResult, getNFTs } from "../../services";

interface SuggestedVideosProps {
  excludeTokenId?: string | number;
  title?: string;
  sortMode?: string;
  range?: string | number;
  unit?: number;
  enablePreview?: boolean;
}

const SuggestedVideos: React.FC<SuggestedVideosProps> = ({
  excludeTokenId,
  title = "Suggested",
  sortMode = "trends",
  range = "week",
  unit = 10,
  enablePreview = true,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<GetNFTsResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await getNFTs({ sortMode, unit });
        if (cancelled) return;
        const list = Array.isArray(res?.result) ? res.result : [];
        setItems(list);
      } catch (e) {
        if (!cancelled) setItems([]);
        console.warn("[SuggestedVideos] getNFTs failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [sortMode, range, unit]);

  const filtered = useMemo(() => {
    if (excludeTokenId == null) return items;
    const ex = String(excludeTokenId);
    return items.filter((it) => String(it.tokenId ?? it.id ?? "") !== ex);
  }, [items, excludeTokenId]);

  if (loading) {
    return (
      <View className="mt-6">
        <VideoPlayerSkeleton variant="suggestions" suggestionCount={6} />
      </View>
    );
  }
  if (!loading && filtered.length === 0) return null;

  return (
    <View className="mt-6">
      <Text className="text-theme-neutrals-100 font-semibold mb-3 text-sm px-4">
        {title}
      </Text>
      {filtered.map((item) => (
        <CompactVideoCard
          key={`${item.tokenId || item.id}`}
          nft={item as any}
          enablePreview={enablePreview}
        />
      ))}
    </View>
  );
};

export default SuggestedVideos;
