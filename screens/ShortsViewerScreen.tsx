import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Dimensions,
  Pressable,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  ViewToken,
  LayoutChangeEvent,
  Modal,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  GestureResponderEvent,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { VideoView, useVideoPlayer } from "expo-video";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Icon from "../components/ui/Icon";
import { CommentBottomSheet } from "../components/Comments";
import { useUser, useAuthActions, useAuthState } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import {
  getVideoUrl,
  getAvatarUrl,
  getShortsThumbnailUrl,
  formatCompactNumber,
  toastError,
  toastSuccess,
  copyToClipboard,
} from "../libs";
import { voteOnNFT } from "../services/nft.service";
import { savePost } from "../services/feed.service";
import { toggleRepost } from "../services/repost.service";
import { getShortsFeed } from "../services/feed.unified.service";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import { ScreenNames } from "../navigation/ScreenNames";
import { ShareLinks } from "../navigation/linking.config";
import { requestAudioFocus, releaseAudioFocus } from "../libs/audioFocus";
import { requestFeedVideoFocus, releaseFeedVideoFocus } from "../libs/feedVideoFocus";
import GlassTipSheet from "../components/Tip/GlassTipSheet";


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ShortItemProps {
  item: UnifiedFeedItem;
  isActive: boolean;
  itemHeight: number;
}

const ShortItem = React.memo<ShortItemProps>(({ item, isActive, itemHeight }) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { isSignedIn } = useAuthState();
  const { showUserProfile } = useUserProfileSheet();

  const tokenId = item.tokenId ?? item.id;
  const videoUrl = getVideoUrl(tokenId) || undefined;
  const thumbnail = getShortsThumbnailUrl(tokenId);
  const avatar = getAvatarUrl(item.minterUser?.avatarImageUrl || item.minterAvatarUrl);
  const username = item.minterUser?.username || item.minterUsername || "";
  const displayName = item.minterUser?.displayName || item.minterDisplayName || username;
  const title = (() => {
    const raw = item.name || item.title || "";
    return raw.toLowerCase() === "untitled" ? "" : raw;
  })();
  const description = item.description || "";

  const minterAddress = item.minter || item.minterUser?.address || "";

  const [liked, setLiked] = useState(!!item.isLiked);
  const [disliked, setDisliked] = useState(!!item.isDisliked);
  const [likeCount, setLikeCount] = useState((item as any).totalVotes?.for || item.likes || 0);
  const [dislikeCount, setDislikeCount] = useState((item as any).totalVotes?.against || item.dislikes || 0);
  const [saved, setSaved] = useState(!!item.isSaved);
  const [showComments, setShowComments] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [reposted, setReposted] = useState(!!item.isReposted);
  const [repostCount, setRepostCount] = useState(item.reposts || 0);
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [is2xSpeed, setIs2xSpeed] = useState(false);

  // Double-tap like animation
  const lastTapRef = useRef(0);
  const likeAnimOpacity = useRef(new Animated.Value(0)).current;
  const likeAnimScale = useRef(new Animated.Value(0.5)).current;
  const likeAnimTransY = useRef(new Animated.Value(0)).current;
  const [likeAnimPos, setLikeAnimPos] = useState({ x: 0, y: 0 });
  const longPressActiveRef = useRef(false);
  const wasPlayingBeforeLongPress = useRef(true);

  const player = useVideoPlayer(videoUrl || null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!player) return;
    if (isActive) {
      requestFeedVideoFocus(() => { try { player.pause(); } catch {} });
      requestAudioFocus(() => { try { player.pause(); } catch {} });
      player.play();
      setIsPlaying(true);
    } else {
      try { player.pause(); } catch {}
      setIsPlaying(false);
    }
    return () => {
      if (isActive) {
        releaseFeedVideoFocus(() => {});
        releaseAudioFocus(() => {});
      }
    };
  }, [isActive, player]);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const togglePlayPauseRef = useRef(() => {
    if (!player || longPressActiveRef.current) return;
    if (isPlayingRef.current) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  });
  // keep ref current so timeout closures always call latest
  togglePlayPauseRef.current = () => {
    if (!player || longPressActiveRef.current) return;
    if (isPlayingRef.current) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = useCallback(() => {
    if (!player) return;
    const next = !isMuted;
    player.muted = next;
    setIsMuted(next);
  }, [player, isMuted]);

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

  const handleTip = useCallback(() => {
    if (!minterAddress) return;
    requireAuth(() => { setShowTipModal(true); });
  }, [minterAddress, requireAuth]);

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

  const handleComment = useCallback(() => {
    setShowComments(true);
  }, []);

  const handleUserPress = useCallback(() => {
    const id = username || item.minter || "";
    if (id) showUserProfile(id);
  }, [username, item.minter, showUserProfile]);

  const handleMenuPress = useCallback(() => {
    setShowMenu(true);
  }, []);

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
    navigation.navigate(ScreenNames.Upload, {
      quotedTokenId: tokenId,
      quotedPost: item as any,
    });
  }, [navigation, tokenId, item]);

  const handleCopyLink = useCallback(() => {
    if (tokenId == null) return;
    copyToClipboard(ShareLinks.post(String(tokenId)));
    toastSuccess("Link copied");
    setShowMenu(false);
  }, [tokenId]);

  const commentCount = item.commentCount || 0;
  const views = item.views || 0;

  // Trigger the floating like animation
  const showLikeAnimation = useCallback((x: number, y: number) => {
    setLikeAnimPos({ x: x - 36, y: y - 36 });
    likeAnimOpacity.setValue(1);
    likeAnimScale.setValue(0.3);
    likeAnimTransY.setValue(0);
    Animated.parallel([
      Animated.spring(likeAnimScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(400),
        Animated.parallel([
          Animated.timing(likeAnimOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(likeAnimTransY, {
            toValue: -80,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [likeAnimOpacity, likeAnimScale, likeAnimTransY]);

  // Handle screen tap — double tap = like, single tap = play/pause
  const handleScreenPress = useCallback((e: GestureResponderEvent) => {
    if (longPressActiveRef.current) return;
    const now = Date.now();
    const { pageX, pageY } = e.nativeEvent;
    if (now - lastTapRef.current < 300) {
      // Double tap → like
      lastTapRef.current = 0;
      showLikeAnimation(pageX, pageY);
      if (!liked) {
        handleLike();
      }
    } else {
      lastTapRef.current = now;
      // Wait to see if a second tap comes
      setTimeout(() => {
        if (lastTapRef.current === now) {
          togglePlayPauseRef.current();
        }
      }, 300);
    }
  }, [liked, handleLike, showLikeAnimation]);

  // Long press — detect center vs right side
  const handleLongPressIn = useCallback((e: GestureResponderEvent) => {
    const { locationX } = e.nativeEvent;
    longPressActiveRef.current = true;
    const isRightSide = locationX > SCREEN_WIDTH * 0.6;

    if (isRightSide) {
      // Right side → 2x speed
      setIs2xSpeed(true);
      if (player) {
        try { (player as any).playbackRate = 2; } catch {}
      }
    } else {
      // Center/left → screenshot mode: pause + hide UI
      wasPlayingBeforeLongPress.current = isPlaying;
      setScreenshotMode(true);
      if (player) {
        try { player.pause(); } catch {}
      }
    }
  }, [player, isPlaying]);

  const handleLongPressOut = useCallback(() => {
    longPressActiveRef.current = false;

    if (is2xSpeed) {
      setIs2xSpeed(false);
      if (player) {
        try { (player as any).playbackRate = 1; } catch {}
      }
    }

    if (screenshotMode) {
      setScreenshotMode(false);
      if (wasPlayingBeforeLongPress.current && player) {
        try {
          player.play();
          setIsPlaying(true);
        } catch {}
      }
    }
  }, [is2xSpeed, screenshotMode, player]);

  return (
    <View style={{ width: SCREEN_WIDTH, height: itemHeight }}>
      <Pressable
        onPress={handleScreenPress}
        onLongPress={handleLongPressIn}
        onPressOut={handleLongPressOut}
        delayLongPress={400}
        style={StyleSheet.absoluteFill}
      >
        {player ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
            pointerEvents="none"
          />
        ) : thumbnail ? (
          <Image source={thumbnail} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }]} pointerEvents="none" />
        )}
      </Pressable>

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
        <Icon name="ThumbsUp" size={72} color="#F9FBFF" fill="#F9FBFF" />
      </Animated.View>

      {/* 2x speed indicator */}
      {is2xSpeed && (
        <View style={styles.speedOverlay} pointerEvents="none">
          <View style={styles.speedBadge}>
            <Icon name="ChevronsRight" size={20} color="#fff" />
            <Text style={styles.speedText}>2x</Text>
          </View>
        </View>
      )}

      {!isPlaying && !screenshotMode && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Icon name="Play" size={64} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {!screenshotMode && (
        <View style={[styles.actionBar, { bottom: 16 }]}>
        <Pressable onPress={handleLike} className="items-center mb-5">
          <Icon
            name="ThumbsUp"
            size={28}
            color={liked ? "#F9FBFF" : "#fff"}
            fill={liked ? "#F9FBFF" : "none"}
          />
          <Text style={styles.actionText}>{formatCompactNumber(likeCount)}</Text>
        </Pressable>

        <Pressable onPress={handleDislike} className="items-center mb-5">
          <Icon
            name="ThumbsDown"
            size={28}
            color={disliked ? "#F9FBFF" : "#fff"}
            fill={disliked ? "#F9FBFF" : "none"}
          />
          <Text style={styles.actionText}>{formatCompactNumber(dislikeCount)}</Text>
        </Pressable>

        <Pressable onPress={handleComment} className="items-center mb-5">
          <Icon name="MessageSquare" size={28} color="#fff" />
          <Text style={styles.actionText}>{formatCompactNumber(commentCount)}</Text>
        </Pressable>

        <Pressable onPress={handleTip} className="items-center mb-5">
          <Icon name="Gem" size={28} color="#fff" />
          <Text style={styles.actionText}>Tip</Text>
        </Pressable>

        <Pressable onPress={handleSave} className="items-center mb-5">
          <Icon
            name="Bookmark"
            size={28}
            color={saved ? "#facc15" : "#fff"}
            fill={saved ? "#facc15" : "none"}
          />
          <Text style={styles.actionText}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>

        <Pressable onPress={handleMenuPress} className="items-center">
          <Icon name="Ellipsis" size={28} color="#fff" />
        </Pressable>
      </View>
      )}

      {/* Menu bottom sheet */}
      <Modal
        visible={showMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenu(false)}
      >
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

      {!screenshotMode && (
      <View style={[styles.creatorInfo, { bottom: 16 }]}>
        <Pressable onPress={handleUserPress} className="flex-row items-center gap-2 mb-2">
          <Image source={avatar} style={styles.avatar} contentFit="cover" />
          <View className="flex-1">
            <Text numberOfLines={1} className="text-white text-sm font-semibold">
              {displayName}
            </Text>
            {username ? (
              <Text numberOfLines={1} className="text-white/60 text-xs">
                @{username}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable onPress={() => setCaptionExpanded((p) => !p)}>
          {title ? (
            <Text
              numberOfLines={captionExpanded ? undefined : 1}
              className="text-white text-sm mb-0.5"
            >
              {title}
            </Text>
          ) : null}
          {description ? (
            <Text
              numberOfLines={captionExpanded ? undefined : 2}
              className="text-white/70 text-xs"
            >
              {description}
            </Text>
          ) : null}
        </Pressable>

        <View className="flex-row items-center gap-1 mt-1.5">
          <Icon name="Eye" size={12} color="rgba(255,255,255,0.5)" />
          <Text style={styles.viewsText}>{formatCompactNumber(views)} views</Text>
        </View>
      </View>
      )}

      {tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
        />
      )}

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

const ShortsViewerScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {
    initialIndex = 0,
    initialItems = [],
    feedParams = {},
  } = (route?.params as any) || {};

  // When entering from FeedCard with a single item, start at page 0
  // so the first loadMore fetches page 1 (the full first page of shorts).
  const isFromFeed = initialItems.length <= 1;

  const [items, setItems] = useState<UnifiedFeedItem[]>(initialItems);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [page, setPage] = useState(isFromFeed ? 0 : 1);
  const endReachedRef = useRef(false);
  const fetchingRef = useRef(false);
  const shuffleSeedRef = useRef<string | undefined>(feedParams.shuffleSeed);
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT);
  const [noMoreShorts, setNoMoreShorts] = useState(false);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContainerHeight(h);
  }, []);

  const loadMore = useCallback(async () => {
    if (endReachedRef.current || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const nextPage = page + 1;
      const params = {
        page: nextPage,
        limit: 20,
        sortBy: feedParams.sortBy || "createdAt" as const,
        shuffleSeed: shuffleSeedRef.current,
        category: feedParams.category,
        minter: feedParams.minter,
        followingOnly: feedParams.followingOnly,
      };
      const res = await getShortsFeed(params);
      const newItems = res.result || [];

      if (res.shuffleSeed && !shuffleSeedRef.current) {
        shuffleSeedRef.current = res.shuffleSeed;
      }

      if (newItems.length === 0 || !res.pagination?.hasMore) {
        endReachedRef.current = true;
        setNoMoreShorts(true);
      }

      setItems((prev) => {
        // Deduplicate by tokenId/id to avoid showing the same short twice
        const existingIds = new Set(prev.map((i) => i.tokenId ?? i.id));
        const unique = newItems.filter((i) => !existingIds.has(i.tokenId ?? i.id));
        return [...prev, ...unique];
      });
      setPage(nextPage);
    } catch (_err) {
      // silent
    } finally {
      fetchingRef.current = false;
    }
  }, [page, feedParams]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const listRef = useRef<FlatList>(null);

  const renderFooter = useCallback(() => {
    if (!noMoreShorts) return null;
    return (
      <View
        style={{
          width: SCREEN_WIDTH,
          height: containerHeight * 0.4,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="Film" size={48} color="rgba(255,255,255,0.3)" />
        <Text className="text-white/50 text-sm mt-3 font-medium">
          You're all caught up
        </Text>
        <Text className="text-white/30 text-xs mt-1">
          Check back later for more shorts
        </Text>
      </View>
    );
  }, [noMoreShorts, containerHeight]);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!noMoreShorts || !listRef.current || items.length === 0) return;
    // Only snap back if user scrolled past the last real item (into footer)
    const offsetY = e.nativeEvent.contentOffset.y;
    const lastItemEnd = items.length * containerHeight;
    if (offsetY < lastItemEnd) return;

    const lastIndex = items.length - 1;
    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: lastIndex * containerHeight,
        animated: true,
      });
    }, 1500);
  }, [noMoreShorts, items.length, containerHeight]);

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedFeedItem; index: number }) => (
      <ShortItem
        item={item}
        isActive={index === activeIndex}
        itemHeight={containerHeight}
      />
    ),
    [activeIndex, containerHeight],
  );

  const keyExtractor = useCallback(
    (item: UnifiedFeedItem, index: number) => String(item.tokenId ?? item.id ?? index),
    [],
  );

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: containerHeight,
    offset: containerHeight * index,
    index,
  }), [containerHeight]);

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        pagingEnabled
        horizontal={false}
        showsVerticalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onMomentumScrollEnd={handleScrollEnd}
        ListFooterComponent={renderFooter}
        removeClippedSubviews
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        getItemLayout={getItemLayout}
      />

      {/* Fixed transparent header overlay – does not scroll */}
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} hitSlop={12} className="p-2">
          <Icon name="ChevronLeft" size={28} color="#fff" />
        </Pressable>
        <Text className="text-white text-base font-semibold">Shorts</Text>
        <View style={{ width: 44 }} />
      </View>
    </View>
  );
};

export default ShortsViewerScreen;

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
    paddingVertical: 8,
    zIndex: 20,
  },
  actionBar: {
    position: "absolute",
    right: 12,
    alignItems: "center",
    zIndex: 10,
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
    right: 72,
    zIndex: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  viewsText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
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
  speedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  speedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  speedText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
