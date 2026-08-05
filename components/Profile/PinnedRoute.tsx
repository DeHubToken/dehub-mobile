import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, FlatList, ActivityIndicator, Pressable, Text, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Icon from "../ui/Icon";
import { apiClient } from "../../libs";
import FeedCard from "../Home/FeedCard";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import ProfileEmptyState from "./ProfileEmptyState";

interface PinnedRouteProps {
  address?: string;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
}

const PAGE_SIZE = 20;

const PinnedRoute: React.FC<PinnedRouteProps> = ({ address, onScroll, listHeader, onBeforeNavigate }) => {
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

  const load = useCallback(() => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    pageRef.current = 1;
    endRef.current = false;
    fetchPins(1).catch((e: any) => setError(e?.message || "Failed to load")).finally(() => setLoading(false));
  }, [address, fetchPins]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || endRef.current || loading) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await fetchPins(pageRef.current).catch(() => { pageRef.current -= 1; });
    setLoadingMore(false);
  }, [loadingMore, loading, fetchPins]);

  if (loading) {
    return (
      <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#fff" />
        </View>
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 12 }}>
          <Icon name="WifiOff" size={48} color="#71717A" />
          <Text style={{ color: "#A6A9AC", fontSize: 14, textAlign: "center" }}>{error}</Text>
          <Pressable
            onPress={load}
            hitSlop={8}
            style={{ height: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.30)", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "500" }}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (items.length === 0) {
    return (
      <ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <ProfileEmptyState
          kind="pinned"
          title="No pinned posts yet"
          subtitle="Pinned posts will appear here"
        />
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, idx) => `${item.tokenId ?? idx}`}
      renderItem={({ item }) => (
        <FeedCard item={item} onBeforeNavigate={onBeforeNavigate} />
      )}
      ListHeaderComponent={listHeader}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 80 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
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
