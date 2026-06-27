import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, FlatList, ActivityIndicator, Text } from "react-native";
import { apiClient } from "../../libs";
import FeedCard from "../Home/FeedCard";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";

interface PinnedRouteProps {
  address?: string;
}

const PAGE_SIZE = 20;

const PinnedRoute: React.FC<PinnedRouteProps> = ({ address }) => {
  const [items, setItems] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const endRef = useRef(false);

  const fetchPins = useCallback(async (page: number) => {
    if (!address) return;
    const res = await apiClient.get<{ result: any[]; pagination?: any }>(
      `/pins`,
      { params: { address, page, limit: PAGE_SIZE } },
    );
    const raw: any[] = res?.result || [];
    // Each pin may embed the full post under `.post` or directly at root
    const mapped: UnifiedFeedItem[] = raw.map((pin) => ({
      ...(pin.post || pin),
      tokenId: pin.tokenId ?? pin.post?.tokenId,
    }));
    if (page === 1) {
      setItems(mapped);
    } else {
      setItems((prev) => [...prev, ...mapped]);
    }
    if (mapped.length < PAGE_SIZE || !res?.pagination?.hasMore) {
      endRef.current = true;
    }
  }, [address]);

  useEffect(() => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    endRef.current = false;
    fetchPins(1).catch((e: any) => setError(e?.message || "Failed to load")).finally(() => setLoading(false));
  }, [address, fetchPins]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || endRef.current || loading) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await fetchPins(pageRef.current).catch(() => { pageRef.current -= 1; });
    setLoadingMore(false);
  }, [loadingMore, loading, fetchPins]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <Text style={{ color: "#a1a1aa" }}>{error}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
        <Text style={{ color: "#71717a", fontSize: 14 }}>No pinned posts yet</Text>
        <Text style={{ color: "#52525b", fontSize: 12, marginTop: 4 }}>Pinned posts will appear here</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, idx) => `${item.tokenId ?? idx}`}
      renderItem={({ item }) => <FeedCard item={item} />}
      contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 80 }}
      onEndReached={endRef.current ? undefined : handleLoadMore}
      onEndReachedThreshold={0.6}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null
      }
    />
  );
};

export default PinnedRoute;
