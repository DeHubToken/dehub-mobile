import Animated from "react-native-reanimated";
import React, { useCallback } from "react";
import { View, ScrollView, FlatList, ActivityIndicator, Pressable, Text, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useProfilePins } from "../../hooks/usePinnedPosts";
import FeedCard from "../Home/FeedCard";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";
import { useCinematicPhone } from "../../hooks/useCinematicPhone";
import ProfileEmptyState from "./ProfileEmptyState";

interface PinnedRouteProps {
  address?: string;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
}

const PinnedRoute: React.FC<PinnedRouteProps> = ({ address, listRef, onScroll, listHeader, onBeforeNavigate }) => {
  const { t } = useTranslation();
  const cinematicPhone = useCinematicPhone();
  const cinematic = cinematicPhone && !!listHeader;
  // The same query the pin row patches, so a pin or unpin shows here at once.
  const pinsQuery = useProfilePins(address);
  const items: UnifiedFeedItem[] = pinsQuery.data || [];
  const loading = !!address && pinsQuery.isLoading;
  const error = pinsQuery.error ? ((pinsQuery.error as any)?.message || t("common.failedToLoad")) : null;
  const load = useCallback(() => { pinsQuery.refetch(); }, [pinsQuery]);

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

  if (items.length === 0) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
        {listHeader}
        <ProfileEmptyState
          kind="pinned"
          title={t("profile.noPinnedPosts")}
          subtitle={t("profile.noPinnedPostsSub")}
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
      showsVerticalScrollIndicator={false}
    />
  );
};

export default PinnedRoute;
