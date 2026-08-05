import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Dimensions,
  Pressable,
  StatusBar,
  StyleSheet,
  ViewToken,
  LayoutChangeEvent,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import FeedCard from "../components/Home/FeedCard";
import { getUnifiedFeed } from "../services/feed.unified.service";
import type { UnifiedFeedItem } from "../services/feed.unified.service";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ── Screen ────────────────────────────────────────────────────────────────────

const ImageFeedScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const {
    initialIndex = 0,
    initialItems = [],
    feedParams = {},
  } = (route?.params as any) || {};

  const isFromFeed = initialItems.length <= 1;

  const [items, setItems] = useState<UnifiedFeedItem[]>(initialItems);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [page, setPage] = useState(isFromFeed ? 0 : 1);
  const [noMore, setNoMore] = useState(false);
  const endReachedRef = useRef(false);
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContainerHeight(h);
  }, []);

  const loadMore = useCallback(async () => {
    if (endReachedRef.current) return;
    try {
      const nextPage = page + 1;
      const res = await getUnifiedFeed({
        postType: "feed-images",
        page: nextPage,
        limit: 20,
        sortBy: feedParams.sortBy || "createdAt",
        ...feedParams,
      });
      const newItems = res.result || [];

      if (newItems.length === 0 || !res.pagination?.hasMore) {
        endReachedRef.current = true;
        setNoMore(true);
      }

      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.tokenId ?? i.id));
        const unique = newItems.filter((i) => !existingIds.has(i.tokenId ?? i.id));
        return [...prev, ...unique];
      });
      setPage(nextPage);
    } catch {
      // silent
    }
  }, [page, feedParams]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const listRef = useRef<FlatList>(null);

  // Opening the feed *at* the tapped post, the way web's ImagesFeed does it:
  // rather than scrolling to an index — unreliable once rows are variable
  // height, since getItemLayout can no longer be supplied — the tapped post is
  // rotated to the front and the rest follow. Anything before it is still
  // reachable by going back to the grid, same as web.
  const orderedItems = useMemo(() => {
    if (!items.length) return items;
    const start = Math.max(0, Math.min(initialIndex, items.length - 1));
    return start === 0 ? items : [...items.slice(start), ...items.slice(0, start)];
  }, [items, initialIndex]);

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedFeedItem; index: number }) => (
      <FeedCard item={item} isVisible={index === activeIndex} enablePreview />
    ),
    [activeIndex],
  );

  const keyExtractor = useCallback(
    (item: UnifiedFeedItem, index: number) => String(item.tokenId ?? item.id ?? index),
    [],
  );

  const renderFooter = useCallback(() => {
    if (!noMore) return null;
    return (
      <View style={{ width: SCREEN_WIDTH, height: containerHeight * 0.4, alignItems: "center", justifyContent: "center" }}>
        <Icon name="Image" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 12, fontWeight: "500" }}>
          You're all caught up
        </Text>
      </View>
    );
  }, [noMore, containerHeight]);

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Deliberately NOT pagingEnabled, and rows are no longer forced to the
          container height: tapping a tile should open a continuous Instagram-
          style scroll of full post cards, not a TikTok-style one-image-per-
          swipe pager. Mirrors web's ImagesFeed, which renders the same ImageCard
          list it uses everywhere else once you click out of the collage. */}
      <FlatList
        ref={listRef}
        data={orderedItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 56,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 8,
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={2}
        ListFooterComponent={renderFooter}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
      />

      {/* Fixed header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.topBarBtn}
        >
          <Icon name="ChevronLeft" size={28} color="#F9FBFF" />
        </Pressable>
        <Text style={styles.topBarTitle}>Images</Text>
        <View style={{ width: 44 }} />
      </View>
    </View>
  );
};

export default ImageFeedScreen;

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 20,
    // Scrim: the title and back arrow float over scrolled images.
    backgroundColor: "rgba(1,3,5,0.55)",
  },
  topBarBtn: {
    width: 44,
    alignItems: "flex-start",
  },
  topBarTitle: {
    color: "#F9FBFF",
    fontSize: 24,
    fontWeight: "500",
  },
  bottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
    backgroundColor: "transparent",
    // React Native doesn't support CSS gradients natively; we use opacity layers
    // The dark cards behind text serve as contrast
  },
  dotsRow: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    zIndex: 10,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 16,
    backgroundColor: "#fff",
  },
  dotInactive: {
    width: 6,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  actionBar: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    zIndex: 10,
  },
  actionBtn: {
    alignItems: "center",
    marginBottom: 20,
  },
  actionText: {
    color: "#fff",
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
  },
  creatorInfo: {
    position: "absolute",
    left: 12,
    right: 80,
    zIndex: 10,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  displayName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  username: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  title: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  description: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  viewPostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  viewPostText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  menuOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    paddingBottom: 40,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignSelf: "center",
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  menuItemText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
});
