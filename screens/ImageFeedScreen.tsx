import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Modal,
  Platform,
  Animated,
  GestureResponderEvent,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import { CommentBottomSheet } from "../components/Comments";
import { useAuthActions, useAuthState, useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import {
  getAvatarUrl,
  getImageUrlApiSimple,
  getImageUrl,
  formatCompactNumber,
  toastError,
  toastSuccess,
  copyToClipboard,
} from "../libs";
import { voteOnNFT } from "../services/nft.service";
import { savePost } from "../services/feed.service";
import { toggleRepost } from "../services/repost.service";
import { getUnifiedFeed } from "../services/feed.unified.service";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import { ScreenNames } from "../navigation/ScreenNames";
import { ShareLinks } from "../navigation/linking.config";
import GlassTipSheet from "../components/Tip/GlassTipSheet";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ── Helpers ──────────────────────────────────────────────────────────────────

const resolveImages = (item: UnifiedFeedItem): string[] => {
  const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
  if (urls.length > 0) return urls.map((u) => getImageUrlApiSimple(u)).filter(Boolean) as string[];
  const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
  return single ? [single] : [];
};

// ── Single post item ──────────────────────────────────────────────────────────

interface ImageFeedItemProps {
  item: UnifiedFeedItem;
  isActive: boolean;
  itemHeight: number;
}

const ImageFeedItem = React.memo<ImageFeedItemProps>(({ item, isActive, itemHeight }) => {
  const navigation = useNavigation<any>();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();

  const tokenId = item.tokenId ?? item.id;
  const images = resolveImages(item);
  const avatar = getAvatarUrl(item.minterUser?.avatarImageUrl || item.minterAvatarUrl);
  const username = item.minterUser?.username || item.minterUsername || "";
  const displayName = item.minterUser?.displayName || item.minterDisplayName || username;
  const minterAddress = item.minter || item.minterUser?.address || "";
  const title = (() => {
    const raw = item.name || item.title || "";
    return raw.toLowerCase() === "untitled" ? "" : raw;
  })();
  const description = item.description || "";

  const [liked, setLiked] = useState(!!item.isLiked);
  const [disliked, setDisliked] = useState(!!item.isDisliked);
  const [likeCount, setLikeCount] = useState((item as any).totalVotes?.for || item.likes || 0);
  const [dislikeCount, setDislikeCount] = useState((item as any).totalVotes?.against || item.dislikes || 0);
  const [saved, setSaved] = useState(!!item.isSaved);
  const [reposted, setReposted] = useState(!!item.isReposted);
  const [repostCount, setRepostCount] = useState(item.reposts || 0);
  const [showComments, setShowComments] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);

  // Double-tap like animation
  const lastTapRef = useRef(0);
  const likeAnimOpacity = useRef(new Animated.Value(0)).current;
  const likeAnimScale = useRef(new Animated.Value(0.5)).current;
  const likeAnimTransY = useRef(new Animated.Value(0)).current;
  const [likeAnimPos, setLikeAnimPos] = useState({ x: 0, y: 0 });

  const showLikeAnimation = useCallback(
    (x: number, y: number) => {
      setLikeAnimPos({ x: x - 36, y: y - 36 });
      likeAnimOpacity.setValue(1);
      likeAnimScale.setValue(0.3);
      likeAnimTransY.setValue(0);
      Animated.parallel([
        Animated.spring(likeAnimScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(400),
          Animated.parallel([
            Animated.timing(likeAnimOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
            Animated.timing(likeAnimTransY, { toValue: -80, duration: 500, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    },
    [likeAnimOpacity, likeAnimScale, likeAnimTransY],
  );

  const handleLike = useCallback(() => {
    if (tokenId == null) return;
    requireAuth(() => {
      const wasLiked = liked;
      const wasDisliked = disliked;
      setLiked(!wasLiked);
      setLikeCount((c: number) => c + (wasLiked ? -1 : 1));
      if (wasDisliked) {
        setDisliked(false);
        setDislikeCount((c: number) => Math.max(0, c - 1));
      }
      voteOnNFT({ streamTokenId: tokenId, vote: true }).catch(() => {
        setLiked(wasLiked);
        setLikeCount((c: number) => c + (wasLiked ? 1 : -1));
        if (wasDisliked) {
          setDisliked(true);
          setDislikeCount((c: number) => c + 1);
        }
        toastError("Failed to update like");
      });
    });
  }, [liked, disliked, tokenId, requireAuth]);

  const handleDislike = useCallback(() => {
    if (tokenId == null) return;
    requireAuth(() => {
      const wasDisliked = disliked;
      const wasLiked = liked;
      setDisliked(!wasDisliked);
      setDislikeCount((c: number) => c + (wasDisliked ? -1 : 1));
      if (wasLiked) {
        setLiked(false);
        setLikeCount((c: number) => Math.max(0, c - 1));
      }
      voteOnNFT({ streamTokenId: tokenId, vote: false }).catch(() => {
        setDisliked(wasDisliked);
        setDislikeCount((c: number) => c + (wasDisliked ? 1 : -1));
        if (wasLiked) {
          setLiked(true);
          setLikeCount((c: number) => c + 1);
        }
        toastError("Failed to update dislike");
      });
    });
  }, [disliked, liked, tokenId, requireAuth]);

  const handleSave = useCallback(() => {
    if (tokenId == null) return;
    requireAuth(() => {
      const wasSaved = saved;
      setSaved(!wasSaved);
      savePost(Number(tokenId)).catch(() => {
        setSaved(wasSaved);
        toastError("Failed to save");
      });
    });
  }, [saved, tokenId, requireAuth]);

  const handleRepost = useCallback(() => {
    if (tokenId == null) return;
    requireAuth(() => {
      const was = reposted;
      const prev = repostCount;
      setReposted(!was);
      setRepostCount((c) => c + (was ? -1 : 1));
      toggleRepost(Number(tokenId)).catch(() => {
        setReposted(was);
        setRepostCount(prev);
        toastError("Failed to repost");
      });
    });
    setShowMenu(false);
  }, [tokenId, reposted, repostCount, requireAuth]);

  const handleQuote = useCallback(() => {
    setShowMenu(false);
    navigation.navigate(ScreenNames.Upload, { quotedTokenId: tokenId, quotedPost: item as any });
  }, [navigation, tokenId, item]);

  const handleCopyLink = useCallback(() => {
    if (tokenId == null) return;
    copyToClipboard(ShareLinks.post(String(tokenId)));
    toastSuccess("Link copied");
    setShowMenu(false);
  }, [tokenId]);

  const handleScreenPress = useCallback(
    (e: GestureResponderEvent) => {
      const now = Date.now();
      const { pageX, pageY } = e.nativeEvent;
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        showLikeAnimation(pageX, pageY);
        if (!liked) handleLike();
      } else {
        lastTapRef.current = now;
      }
    },
    [liked, handleLike, showLikeAnimation],
  );

  const handleUserPress = useCallback(() => {
    const id = username || item.minter || "";
    if (id) showUserProfile(id);
  }, [username, item.minter, showUserProfile]);

  const handleOpenPost = useCallback(() => {
    if (tokenId != null) navigation.navigate(ScreenNames.FeedDetail as any, { postId: String(tokenId) });
  }, [navigation, tokenId]);

  // Image carousel scroll tracking
  const onImgScroll = useCallback((e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    setImgIndex(Math.max(0, Math.min(idx, images.length - 1)));
  }, [images.length]);

  const imgKeyExtractor = useCallback((_: string, i: number) => `img-${i}`, []);

  const renderImage = useCallback(
    ({ item: uri }: { item: string }) => (
      <Pressable onPress={handleScreenPress} style={{ width: SCREEN_WIDTH, height: itemHeight }}>
        <Image
          source={uri}
          style={{ width: SCREEN_WIDTH, height: itemHeight }}
          contentFit="cover"
          recyclingKey={uri}
          cachePolicy="memory-disk"
          transition={100}
        />
      </Pressable>
    ),
    [handleScreenPress, itemHeight],
  );

  const imgGetItemLayout = useCallback(
    (_: any, index: number) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index }),
    [],
  );

  return (
    <View style={{ width: SCREEN_WIDTH, height: itemHeight }}>
      {/* Image carousel */}
      {images.length > 0 ? (
        <FlatList
          data={images}
          keyExtractor={imgKeyExtractor}
          renderItem={renderImage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onImgScroll}
          getItemLayout={imgGetItemLayout}
          bounces={false}
          windowSize={3}
          removeClippedSubviews
          scrollEventThrottle={16}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}

      {/* Dark gradient at bottom */}
      <View style={styles.bottomGradient} pointerEvents="none" />

      {/* Double-tap like animation */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: likeAnimPos.x,
          top: likeAnimPos.y,
          opacity: likeAnimOpacity,
          transform: [{ scale: likeAnimScale }, { translateY: likeAnimTransY }],
          zIndex: 100,
        }}
      >
        <Icon name="Heart" size={72} color="#f43f5e" fill="#f43f5e" />
      </Animated.View>

      {/* Multi-image dot indicators (top center) */}
      {images.length > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          {images.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === imgIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
      )}

      {/* Right action bar */}
      <View style={[styles.actionBar, { bottom: 80 }]}>
        <Pressable onPress={handleLike} style={styles.actionBtn}>
          <Icon
            name="ThumbsUp"
            size={28}
            color={liked ? "#F9FBFF" : "#fff"}
            fill={liked ? "#F9FBFF" : "none"}
          />
          <Text style={styles.actionText}>{formatCompactNumber(likeCount)}</Text>
        </Pressable>

        <Pressable onPress={handleDislike} style={styles.actionBtn}>
          <Icon
            name="ThumbsDown"
            size={28}
            color={disliked ? "#F9FBFF" : "#fff"}
            fill={disliked ? "#F9FBFF" : "none"}
          />
          <Text style={styles.actionText}>{formatCompactNumber(dislikeCount)}</Text>
        </Pressable>

        <Pressable onPress={() => setShowComments(true)} style={styles.actionBtn}>
          <Icon name="MessageSquare" size={28} color="#fff" />
          <Text style={styles.actionText}>{formatCompactNumber(item.commentCount || 0)}</Text>
        </Pressable>

        <Pressable onPress={() => requireAuth(() => setShowTipModal(true))} style={styles.actionBtn}>
          <Icon name="Gem" size={28} color="#fff" />
          <Text style={styles.actionText}>Tip</Text>
        </Pressable>

        <Pressable onPress={handleSave} style={styles.actionBtn}>
          <Icon
            name="Bookmark"
            size={28}
            color={saved ? "#facc15" : "#fff"}
            fill={saved ? "#facc15" : "none"}
          />
          <Text style={styles.actionText}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>

        <Pressable onPress={() => setShowMenu(true)} style={styles.actionBtn}>
          <Icon name="Ellipsis" size={28} color="#fff" />
        </Pressable>
      </View>

      {/* Creator info + caption (bottom-left) */}
      <View style={[styles.creatorInfo, { bottom: 80 }]}>
        <Pressable onPress={handleUserPress} style={styles.creatorRow}>
          <Image source={avatar} style={styles.avatar} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.displayName}>{displayName}</Text>
            {username ? (
              <Text numberOfLines={1} style={styles.username}>@{username}</Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable onPress={() => setCaptionExpanded((p) => !p)}>
          {title ? (
            <Text numberOfLines={captionExpanded ? undefined : 1} style={styles.title}>
              {title}
            </Text>
          ) : null}
          {description ? (
            <Text numberOfLines={captionExpanded ? undefined : 2} style={styles.description}>
              {description}
            </Text>
          ) : null}
        </Pressable>

        <Pressable onPress={handleOpenPost} style={styles.viewPostBtn}>
          <Text style={styles.viewPostText}>View post</Text>
          <Icon name="ExternalLink" size={12} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      {/* Menu modal */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
              {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.08)" }]} />
            <View style={styles.menuHandle} />

            <Pressable onPress={handleRepost} style={styles.menuItem}>
              <Icon name="Repeat2" size={22} color={reposted ? "#22c55e" : "#fff"} />
              <Text style={styles.menuItemText}>{reposted ? "Undo Repost" : "Repost"}</Text>
            </Pressable>

            <Pressable onPress={handleQuote} style={styles.menuItem}>
              <Icon name="Quote" size={22} color="#fff" />
              <Text style={styles.menuItemText}>Quote</Text>
            </Pressable>

            <Pressable onPress={handleCopyLink} style={styles.menuItem}>
              <Icon name="Link" size={22} color="#fff" />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Comments sheet */}
      {tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
        />
      )}

      {/* Tip sheet */}
      {minterAddress ? (
        <GlassTipSheet
          visible={showTipModal}
          onClose={() => setShowTipModal(false)}
          toAddress={minterAddress}
          tokenId={Number(tokenId) || 0}
          recipientName={displayName}
          tipContext="content"
        />
      ) : null}
    </View>
  );
});

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

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedFeedItem; index: number }) => (
      <ImageFeedItem item={item} isActive={index === activeIndex} itemHeight={containerHeight} />
    ),
    [activeIndex, containerHeight],
  );

  const keyExtractor = useCallback(
    (item: UnifiedFeedItem, index: number) => String(item.tokenId ?? item.id ?? index),
    [],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: containerHeight, offset: containerHeight * index, index }),
    [containerHeight],
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

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={2}
        ListFooterComponent={renderFooter}
        removeClippedSubviews
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        getItemLayout={containerHeight > 0 ? getItemLayout : undefined}
      />

      {/* Fixed header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.topBarBtn}>
          <Icon name="ChevronLeft" size={28} color="#fff" />
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
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 20,
  },
  topBarBtn: {
    width: 44,
    alignItems: "flex-start",
  },
  topBarTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
