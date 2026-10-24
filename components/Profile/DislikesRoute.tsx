import Animated from "react-native-reanimated";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, FlatList, ActivityIndicator, Pressable, Text, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { apiClient } from "../../libs";
import FeedCard from "../Home/FeedCard";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";
import { useCinematicPhone } from "../../hooks/useCinematicPhone";
import ProfileEmptyState from "./ProfileEmptyState";

interface DislikesRouteProps {
  address?: string;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
  isOwnProfile?: boolean;
}

const PAGE_SIZE = 20;

/**
 * The profile Dislikes tab: posts this account disliked, newest first. They are
 * out of the owner's feeds; undoing the dislike here (tap the 👎 thumb) brings a
 * post back. The API answers 403 for someone else's dislikes unless they made
 * them public, which shows as the private state below.
 */
const DislikesRoute: React.FC<DislikesRouteProps> = ({ address, listRef, onScroll, listHeader, onBeforeNavigate, isOwnProfile }) => {
  const { t } = useTranslation();
  const cinematicPhone = useCinematicPhone();
  const cinematic = cinematicPhone && !!listHeader;
  const [items, setItems] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const endRef = useRef(false);

  const [isPrivate, setIsPrivate] = useState(false);

  const fetchPage = useCallback(async (page: number) => {
    if (!address) return;
    const res = await apiClient.get<{ result: any[]; pagination?: any }>(
      `/disliked_posts`,
      { params: { address: address.toLowerCase(), page, limit: PAGE_SIZE } },
    );
    const mapped: UnifiedFeedItem[] = res?.result || [];
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
    setIsPrivate(false);
    fetchPage(1)
      .catch((e: any) => {
        if (e?.status === 403 || e?.response?.status === 403) setIsPrivate(true);
        else setError(e?.message || t("common.failedToLoad"));
      })
      .finally(() => setLoading(false));
  }, [address, fetchPage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || endRef.current || loading) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await fetchPage(pageRef.current).catch(() => { pageRef.current -= 1; });
    setLoadingMore(false);
  }, [loadingMore, loading, fetchPage]);

  const keyExtractor = useCallback(
    (item: UnifiedFeedItem, idx: number) => `${item.tokenId ?? idx}`,
    [],
  );
  const {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    isItemAutoplayActive,
    visibilityExtraData,
  } = useFeedCardVisibility(keyExtractor as (item: unknown, index: number) => string);

  if (loading) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        {listHeader}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#fff" />
        </View>
      </Animated.ScrollView>
    );
  }

  if (error) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        {listHeader}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 12 }}>
          <Icon name="WifiOff" size={48} color="#808089" />
          <Text style={{ color: "#A6A9AC", fontSize: 14, textAlign: "center" }}>{error}</Text>
          <Pressable
            onPress={load}
            hitSlop={8}
            style={{ height: 40, borderWidth: 1, borderColor: "rgba(255,255,255,0.30)", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "500" }}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>
    );
  }

  if (isPrivate || items.length === 0) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        {listHeader}
        <ProfileEmptyState
          kind="posts"
          title={isPrivate ? t("profile.dislikesPrivateTitle") : t("profile.dislikesEmptyTitle")}
          subtitle={isPrivate ? t("profile.dislikesPrivateDesc") : isOwnProfile ? t("profile.dislikesEmptyOwn") : t("profile.dislikesEmptyOther")}
        />
      </Animated.ScrollView>
    );
  }

  return (
    <Animated.FlatList
      ref={listRef}
      data={items}
      keyExtractor={keyExtractor}
      renderItem={({ item, index }) => (
        <View style={cinematic ? { paddingHorizontal: 8 } : undefined}>
          <FeedCard
            cinematic={cinematic}
            item={item}
            isVisible={isItemVisible(keyExtractor(item, index))}
            isAutoplayActive={isItemAutoplayActive(keyExtractor(item, index))}
            onBeforeNavigate={onBeforeNavigate}
          />
        </View>
      )}
      ListHeaderComponent={listHeader}
      contentContainerStyle={{ paddingHorizontal: cinematic ? 0 : 16, paddingTop: cinematic ? 0 : 8, paddingBottom: 80 }}
      windowSize={7}
      maxToRenderPerBatch={4}
      initialNumToRender={4}
      onScroll={onScroll}
      scrollEventThrottle={16}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      extraData={visibilityExtraData}
      onEndReached={endRef.current ? undefined : handleLoadMore}
      onEndReachedThreshold={0.6}
      ListFooterComponent={
        loadingMore ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null
      }
      showsVerticalScrollIndicator={false}
    />
  );
};

export default DislikesRoute;
