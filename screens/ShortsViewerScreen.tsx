/**
 * Shorts Viewer — full-screen vertical carousel.
 *
 * The chrome mirrors the web viewer (dehubweb
 * src/components/app/cards/ShortsViewer.tsx): a horizontal action bar spread
 * across the bottom of the frame in feed-card order — views · tip · dislike ·
 * share · comments · like, with like at the far right for thumb reach — and the
 * creator row + caption stacked above it. Back sits top-left; playback speed,
 * mute and the options menu top-right. Bookmark and the moderation actions live
 * in that menu rather than on the bar, as on web.
 *
 * All of that chrome is one material: the top buttons, the creator avatar and
 * the action bar share a single fill, hairline and corner radius (see the
 * CHROME_* tokens), and both bars hang off the same EDGE margin. The action
 * bar's six cells are equal flex shares rather than `space-between` over
 * content-sized children, so the icons hold a fixed grid no matter how wide the
 * counts under them get.
 *
 * Engagement goes through the shared overlay (libs/engagementCache) instead of
 * local state, so a like cast here is the same like the feed card shows — the
 * mobile equivalent of web's vote cache.
 */
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
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  GestureResponderEvent,
  ActivityIndicator,
  Platform,
  StyleProp,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, useNavigation } from "@react-navigation/native";
import { VideoView, useVideoPlayer } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Icon from "../components/ui/Icon";
import type { IconName } from "../components/ui/Icon";
import { CommentBottomSheet } from "../components/Comments";
import { useUser, useAuthActions } from "../context/AuthContext";
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
import { voteOnNFT, reactToNFT } from "../services/nft.service";
import ReactionPicker from "../components/Home/ReactionPicker";
import ReactionInfoSheet from "../components/Home/ReactionInfoSheet";
import ShareSheet from "../components/Home/ShareSheet";
import PostOptionsMenu from "../components/common/PostOptionsMenu";
import {
  applyReactionDelta,
  isPositiveReaction,
  reactionMeta,
  resolveTopReaction,
  type PostReaction,
} from "../libs/reactions";
import {
  applyEngagement,
  engagementKeyOf,
  isFailedResponse,
  revertEngagement,
  useEngagement,
} from "../libs/engagementCache";
import { savePost } from "../services/feed.service";
import { toggleRepost } from "../services/repost.service";
import { getShortsFeed } from "../services/feed.unified.service";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import { ScreenNames } from "../navigation/ScreenNames";
import { ShareLinks } from "../navigation/linking.config";
import { requestAudioFocus, releaseAudioFocus } from "../libs/audioFocus";
import { requestFeedVideoFocus, releaseFeedVideoFocus } from "../libs/feedVideoFocus";
import GlassTipSheet from "../components/Tip/GlassTipSheet";
import { resolveViewCount } from "../libs/numbers.util";


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/** Same ladder the web viewer cycles through on its speed button. */
const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;
const formatRate = (rate: number) => `${rate}x`;

const ICON_COLOR = "#fff";
const COUNT_COLOR = "rgba(255,255,255,0.72)";

/**
 * One chrome language for the whole viewer.
 *
 * Every floating control — the three top buttons, the creator avatar and the
 * bottom action bar — is built from these tokens, so the top of the frame and
 * the bottom read as the same system rather than two unrelated treatments.
 * EDGE is also what anchors both bars to the same left/right margin.
 */
const EDGE = 12;
const CHROME_GAP = 8;
const CHROME_SIZE = 40;
const CHROME_RADIUS = 14;
const BAR_HEIGHT = 46;
const BAR_RADIUS = 16;
const CHROME_FILL = "rgba(9,9,11,0.55)";
const CHROME_BORDER = "rgba(255,255,255,0.14)";
// Takes the 40pt buttons past the 44pt tap minimum. The horizontal half is
// exactly CHROME_GAP / 2, so neighbours in the top-right group meet at the
// midpoint of the gap instead of overlapping and stealing each other's taps.
const CHROME_HIT_SLOP = { top: 6, bottom: 6, left: CHROME_GAP / 2, right: CHROME_GAP / 2 };

/**
 * The shared glass material, as an absolutely-positioned sibling rather than a
 * wrapper.
 *
 * Two reasons it is not a wrapper: the reaction tray pops out of the top of the
 * action bar, and the `overflow: hidden` a rounded blur needs would clip it;
 * and keeping the fill `pointerEvents="none"` lets taps on the bar's own
 * padding still reach the video underneath.
 *
 * The Android backdrop blur is deliberately absent. `dimezisBlurView`
 * re-snapshots the root view every frame and throws when a list mutates its
 * children mid-draw, so it is only safe on surfaces that mount and unmount
 * (see components/ui/LiquidGlass.tsx) — never on chrome pinned over a video
 * feed that is recycling cells. The 55% fill carries the contrast on its own.
 */
const ChromeFill: React.FC<{ radius?: number }> = ({ radius = CHROME_RADIUS }) => (
  <View
    pointerEvents="none"
    style={[
      StyleSheet.absoluteFill,
      styles.chromeFill,
      { borderRadius: radius },
    ]}
  >
    {Platform.OS === "ios" && (
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
    )}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: CHROME_FILL }]} />
  </View>
);

interface ActionButtonProps {
  icon: IconName;
  /** Renders in place of the icon — used to show a reaction emoji. */
  glyph?: string;
  active?: boolean;
  label?: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** Overrides the stretch-to-fill cell. Only the like button needs it — see below. */
  style?: StyleProp<ViewStyle>;
}

/**
 * One button on the bottom bar. Icon and count sit side by side, matching the
 * feed card's bar (FeedActionBar) and the web viewer's row.
 *
 * The button IS the cell: it stretches to fill an equal share of the bar, so
 * the icons sit on a fixed grid. The row used to be `space-between` over
 * content-sized children, which let a count growing from "9" to "12.4K" shove
 * every icon beside it sideways.
 */
const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  glyph,
  active,
  label,
  onPress,
  onLongPress,
  accessibilityLabel,
  style,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress, scale]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      // Matches the web tray's 400ms hold so the gesture feels the same on both.
      delayLongPress={400}
      accessibilityLabel={accessibilityLabel}
      // The cell is already 46pt tall and ~56pt wide, so no slop is needed to
      // clear the 44pt minimum — and adding any would make adjacent cells
      // overlap and steal each other's taps.
      style={style ?? styles.actionCell}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {glyph ? (
          <Text style={styles.actionGlyph}>{glyph}</Text>
        ) : (
          <Icon
            name={icon}
            size={19}
            color={ICON_COLOR}
            strokeWidth={1.8}
            fill={active ? ICON_COLOR : "none"}
          />
        )}
      </Animated.View>
      {label !== undefined && (
        <Text style={styles.actionCount} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
};

interface ShortItemProps {
  item: UnifiedFeedItem;
  isActive: boolean;
  itemHeight: number;
  /** Viewer-level, so mute and speed carry across shorts as they do on web. */
  isMuted: boolean;
  playbackRate: number;
  bottomInset: number;
  /**
   * Reports the hold-to-hide-UI state up to the screen, so the top bar and its
   * scrim disappear with the bottom stack. They live outside this component
   * and used to stay on screen through a "hide the chrome" gesture.
   */
  onChromeVisibilityChange: (visible: boolean) => void;
}

const ShortItem = React.memo<ShortItemProps>(({ item, isActive, itemHeight, isMuted, playbackRate, bottomInset, onChromeVisibilityChange }) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { requireAuth } = useAuthActions();
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
  const userAddress = user?.address || user?.walletAddress || "";
  // Who reacted what is the author's to see, so the ⓘ in the tray only exists
  // on your own shorts (the API withholds the list from everyone else too).
  const isOwnShort = !!(
    userAddress && minterAddress && userAddress.toLowerCase() === minterAddress.toLowerCase()
  );

  // Shared overlay — every surface showing this post reads the same numbers.
  const engagementKey = engagementKeyOf(item);
  const {
    isLiked: liked,
    isDisliked: disliked,
    isReposted: reposted,
    likeCount,
    dislikeCount,
    repostCount,
    myReaction,
    reactionCounts,
  } = useEngagement(item);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [showReactionInfo, setShowReactionInfo] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
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

  // The initialiser runs once, so read the current mute through a ref —
  // otherwise a short opened while muted plays a burst of sound before the
  // sync effect below lands.
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;

  const player = useVideoPlayer(videoUrl || null, (p) => {
    p.loop = true;
    p.muted = mutedRef.current;
  });

  useEffect(() => {
    if (!player) return;
    if (isActive) {
      requestFeedVideoFocus(() => { try { player.pause(); } catch {} });
      requestAudioFocus(() => { try { player.pause(); } catch {} });
      player.play();
      setIsPlaying(true);
      setIsPausedByUser(false);
    } else {
      try { player.pause(); } catch {}
      setIsPlaying(false);
      setIsPausedByUser(false);
    }
    return () => {
      if (isActive) {
        releaseFeedVideoFocus(() => {});
        releaseAudioFocus(() => {});
      }
    };
  }, [isActive, player]);

  useEffect(() => {
    if (!player) return;
    try { player.muted = isMuted; } catch {}
  }, [player, isMuted]);

  // Hold-on-the-right temporarily overrides the chosen rate; releasing drops
  // back to it rather than hardcoding 1x.
  useEffect(() => {
    if (!player) return;
    try { (player as any).playbackRate = is2xSpeed ? 2 : playbackRate; } catch {}
  }, [player, playbackRate, is2xSpeed]);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const togglePlayPauseRef = useRef(() => {});
  // keep ref current so timeout closures always call latest
  togglePlayPauseRef.current = () => {
    if (!player || longPressActiveRef.current) return;
    if (isPlayingRef.current) {
      player.pause();
      setIsPlaying(false);
      setIsPausedByUser(true);
    } else {
      player.play();
      setIsPlaying(true);
      setIsPausedByUser(false);
    }
  };

  /**
   * Cast, switch or toggle off a reaction on the current short.
   *
   * Counts track POLARITY, so swapping like → love moves neither — only
   * `reactionCounts`. See components/Home/FeedCard.tsx for the full reasoning.
   */
  const voteInFlightRef = useRef(false);
  const handleReaction = useCallback((reaction: PostReaction) => {
    if (tokenId == null) return;
    // One vote at a time — same double-tap guard as FeedCard.
    if (voteInFlightRef.current) return;
    requireAuth(() => {
      voteInFlightRef.current = true;
      const wasLiked = liked;
      const wasDisliked = disliked;
      const wasReaction = myReaction;
      const wasCounts = reactionCounts;
      const wasLikeCount = likeCount;
      const wasDislikeCount = dislikeCount;

      const isRemoving = wasReaction === reaction;
      const next: PostReaction | null = isRemoving ? null : reaction;

      const wasPositive = wasReaction ? isPositiveReaction(wasReaction) : false;
      const wasNegative = wasReaction ? !wasPositive : false;
      const nextPositive = next ? isPositiveReaction(next) : false;
      const nextNegative = next ? !nextPositive : false;

      let nextLikeCount = wasLikeCount;
      let nextDislikeCount = wasDislikeCount;
      if (wasPositive && !nextPositive) nextLikeCount = Math.max(0, nextLikeCount - 1);
      if (!wasPositive && nextPositive) nextLikeCount += 1;
      if (wasNegative && !nextNegative) nextDislikeCount = Math.max(0, nextDislikeCount - 1);
      if (!wasNegative && nextNegative) nextDislikeCount += 1;

      applyEngagement(engagementKey, {
        isLiked: nextPositive,
        isDisliked: nextNegative,
        myReaction: next,
        likeCount: nextLikeCount,
        dislikeCount: nextDislikeCount,
        reactionCounts: applyReactionDelta(wasCounts, wasReaction, next),
      });

      const rollback = () => {
        // Restore only the fields this handler owns, so a concurrent save or
        // repost that succeeded is not undone.
        revertEngagement(engagementKey, {
          isLiked: wasLiked,
          isDisliked: wasDisliked,
          myReaction: wasReaction,
          likeCount: wasLikeCount,
          dislikeCount: wasDislikeCount,
          reactionCounts: wasCounts,
        });
        toastError("Failed to update reaction");
      };

      const request =
        reaction === "like" || reaction === "dislike"
          ? voteOnNFT({ streamTokenId: tokenId, vote: reaction === "like", account: userAddress })
          : reactToNFT({ streamTokenId: tokenId, reaction });

      // A 200 carrying `{ error }` resolves rather than throwing, so `.catch`
      // alone would record a failed vote as successful.
      request
        .then((res) => { if (isFailedResponse(res)) rollback(); })
        .catch(rollback)
        .finally(() => {
          voteInFlightRef.current = false;
        });
    });
  }, [liked, disliked, myReaction, reactionCounts, likeCount, dislikeCount, engagementKey, tokenId, userAddress, requireAuth]);

  /** Tapping a thumb re-sends the held reaction of that polarity, which toggles it off. */
  const togglePolarity = useCallback((positive: boolean) => {
    const holdsSamePolarity = myReaction !== null && isPositiveReaction(myReaction) === positive;
    handleReaction(holdsSamePolarity ? myReaction! : (positive ? "like" : "dislike"));
  }, [handleReaction, myReaction]);

  const handleLike = useCallback(() => togglePolarity(true), [togglePolarity]);
  const handleDislike = useCallback(() => togglePolarity(false), [togglePolarity]);

  /** Viewer's own reaction wins over the short's most-used one. */
  const leadReaction = myReaction ?? resolveTopReaction(reactionCounts);
  const leadGlyph = leadReaction && leadReaction !== "like" ? reactionMeta(leadReaction).emoji : undefined;

  const handleTip = useCallback(() => {
    if (!minterAddress) return;
    requireAuth(() => { setShowTipModal(true); });
  }, [minterAddress, requireAuth]);

  const handleComment = useCallback(() => {
    setShowComments(true);
  }, []);

  const handleUserPress = useCallback(() => {
    const id = username || item.minter || "";
    if (id) showUserProfile(id);
  }, [username, item.minter, showUserProfile]);

  const handleRepost = useCallback((next: boolean) => {
    if (tokenId == null) return;
    requireAuth(() => {
      const wasReposted = reposted;
      const prevCount = repostCount;
      applyEngagement(engagementKey, {
        isReposted: next,
        repostCount: next ? prevCount + 1 : Math.max(0, prevCount - 1),
      });
      const rollback = () => {
        revertEngagement(engagementKey, { isReposted: wasReposted, repostCount: prevCount });
        toastError(next ? "Failed to repost" : "Failed to remove repost");
      };
      toggleRepost(Number(tokenId))
        .then((res) => {
          if (isFailedResponse(res)) {
            rollback();
            return;
          }
          // Server flag wins. Its own repostCount is not adopted — see the note
          // in FeedCard.handleUndoRepost about quotes being folded into it.
          if (typeof res?.reposted === "boolean" && res.reposted !== next) {
            applyEngagement(engagementKey, { isReposted: res.reposted, repostCount: prevCount });
          }
        })
        .catch(rollback);
    });
  }, [tokenId, reposted, repostCount, engagementKey, requireAuth]);

  const handleQuote = useCallback(() => {
    requireAuth(() => {
      navigation.navigate(ScreenNames.Upload, {
        quotedTokenId: tokenId,
        quotedPost: item as any,
      });
    });
  }, [navigation, tokenId, item, requireAuth]);

  const handleCopyLink = useCallback(() => {
    if (tokenId == null) return;
    copyToClipboard(ShareLinks.post(String(tokenId)));
    toastSuccess("Link copied");
  }, [tokenId]);

  const commentCount = item.commentCount || 0;
  const tipCount = (item as any).totalTips || (item as any).tips || 0;
  // Signed-out viewers are already folded into totalViews by the API.
  const views = resolveViewCount(item);

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
    // A tap that dismisses the reaction tray is not also a play/pause.
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
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
  }, [liked, handleLike, showLikeAnimation, pickerOpen]);

  // Long press — detect center vs right side
  const handleLongPressIn = useCallback((e: GestureResponderEvent) => {
    const { locationX } = e.nativeEvent;
    longPressActiveRef.current = true;
    const isRightSide = locationX > SCREEN_WIDTH * 0.6;

    if (isRightSide) {
      // Right side → 2x speed
      setIs2xSpeed(true);
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

    // Clearing the flag restores the viewer's chosen rate via the effect above.
    if (is2xSpeed) setIs2xSpeed(false);

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

  const chromeVisible = !screenshotMode;

  // Only the short being watched drives the screen-level chrome, and the
  // cleanup puts it back — otherwise swiping away mid-hold would strand the
  // top bar hidden.
  useEffect(() => {
    if (!isActive) return;
    onChromeVisibilityChange(chromeVisible);
    return () => onChromeVisibilityChange(true);
  }, [isActive, chromeVisible, onChromeVisibilityChange]);

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

      {isActive && isPausedByUser && chromeVisible && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Icon name="Play" size={64} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {chromeVisible && (
        <>
          {/* Legibility gradient behind the bottom stack, as on web. */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
            style={styles.bottomGradient}
            pointerEvents="none"
          />

          {/* Creator info + caption, with the action bar as the bottommost row.
              box-none so the gaps between buttons still toggle playback rather
              than swallowing the tap. */}
          <View
            style={[
              styles.bottomStack,
              // insets.bottom is already the nav bar / home indicator under an
              // edge-to-edge window, so the bar only needs a small optical gap
              // on top of it. It used to add 16 there and float well clear of
              // the bottom of the frame.
              { paddingBottom: bottomInset + 10 },
            ]}
            pointerEvents="box-none"
          >
            {/* Caption block is inset by the bar's own inner padding so the
                creator name starts on the same vertical line as the first icon
                below it. */}
            <View style={styles.captionBlock} pointerEvents="box-none">
              <Pressable onPress={handleUserPress} style={styles.creatorRow}>
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

              <Pressable onPress={() => setCaptionExpanded((p) => !p)} hitSlop={8}>
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
                {description.length > 80 || title.length > 40 ? (
                  <Text className="text-white/50 text-xs mt-0.5">
                    {captionExpanded ? "less" : "more"}
                  </Text>
                ) : null}
              </Pressable>
            </View>

            {/* Action bar — the same glass slab as the top buttons, divided
                into six equal cells so the icons keep a fixed rhythm whatever
                the counts read. Order matches the web viewer and the feed
                card's own bar, like at the far right for thumb reach. */}
            <View style={styles.actionBarWrap} pointerEvents="box-none">
              <ChromeFill radius={BAR_RADIUS} />

              <View style={styles.actionBar} pointerEvents="box-none">
                {/* Views — a readout, not a button, as on web. */}
                <View style={styles.actionCell}>
                  <Icon name="Eye" size={19} color={ICON_COLOR} strokeWidth={1.8} />
                  <Text style={styles.actionCount} numberOfLines={1}>
                    {formatCompactNumber(views)}
                  </Text>
                </View>

                <ActionButton
                  icon="Gem"
                  label={formatCompactNumber(tipCount)}
                  onPress={handleTip}
                  accessibilityLabel="Tip"
                />

                <ActionButton
                  icon="ThumbsDown"
                  active={disliked}
                  label={formatCompactNumber(dislikeCount)}
                  onPress={handleDislike}
                  accessibilityLabel="Dislike"
                />

                {/* Share — carries the repost count, and opens the share sheet. */}
                <ActionButton
                  icon="Share2"
                  active={reposted}
                  label={formatCompactNumber(repostCount)}
                  onPress={() => setShowShareSheet(true)}
                  accessibilityLabel="Share"
                />

                <ActionButton
                  icon="MessageSquare"
                  label={formatCompactNumber(commentCount)}
                  onPress={handleComment}
                  accessibilityLabel="Comments"
                />

                {/* Reactions — tap to like/unlike, hold to pick one of the nine.
                    The outer view is the cell; the inner one is the tray's
                    positioning context and stays button-sized, so the tray
                    anchors to the thumb rather than to the whole cell. The tray
                    keeps itself inside the screen from there. */}
                <View style={styles.actionCell}>
                  <View style={{ position: "relative" }}>
                    <ReactionPicker
                      open={pickerOpen}
                      current={myReaction}
                      onSelect={(reaction) => { setPickerOpen(false); handleReaction(reaction); }}
                      align="right"
                      onShowInfo={
                        isOwnShort && tokenId != null
                          ? () => { setPickerOpen(false); setShowReactionInfo(true); }
                          : undefined
                      }
                    />
                    <ActionButton
                      style={styles.actionInline}
                      icon="ThumbsUp"
                      glyph={leadGlyph}
                      active={liked}
                      label={formatCompactNumber(likeCount)}
                      onPress={() => { if (pickerOpen) { setPickerOpen(false); return; } handleLike(); }}
                      onLongPress={() => setPickerOpen(true)}
                      accessibilityLabel={
                        myReaction
                          ? `${reactionMeta(myReaction).label} — hold to change your reaction`
                          : "Like — hold to react"
                      }
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </>
      )}

      {showShareSheet && tokenId != null && (
        <ShareSheet
          visible={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          isReposted={reposted}
          onRepost={() => handleRepost(true)}
          onUndoRepost={() => handleRepost(false)}
          onQuote={handleQuote}
          onCopyLink={handleCopyLink}
        />
      )}

      {tokenId != null && (
        <CommentBottomSheet
          visible={showComments}
          onClose={() => setShowComments(false)}
          tokenId={tokenId}
          commentsDisabled={!!(item as any).commentsDisabled}
        />
      )}

      {showReactionInfo && tokenId != null && (
        <ReactionInfoSheet
          visible={showReactionInfo}
          onClose={() => setShowReactionInfo(false)}
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
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { requireAuth } = useAuthActions();
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
  // True until the first page resolves when the viewer opened without items.
  const [initialLoading, setInitialLoading] = useState(initialItems.length === 0);

  // Viewer-level playback chrome — mute and speed persist across shorts, as on
  // web, rather than resetting with every slide.
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  // Holding the middle of a short hides its chrome for a clean screenshot; the
  // active item reports that up so the top bar goes with it.
  const [chromeVisible, setChromeVisible] = useState(true);

  // Follow / visibility overrides keyed by creator address and token, so an
  // action taken in the options menu sticks while the viewer stays open.
  const [followOverrides, setFollowOverrides] = useState<Record<string, boolean>>({});
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});

  const activeItem = items[activeIndex];
  const activeTokenId = activeItem?.tokenId ?? activeItem?.id;
  const activeEngagement = useEngagement(activeItem);
  const activeMinter = activeItem?.minter || activeItem?.minterUser?.address || "";
  const activeUsername = activeItem?.minterUser?.username || activeItem?.minterUsername || "";
  const activeDisplayName =
    activeItem?.minterUser?.displayName || activeItem?.minterDisplayName || activeUsername;
  const userAddress = user?.address || user?.walletAddress || "";
  const isOwnerOfActive = !!(
    (activeItem as any)?.isOwner ||
    (userAddress && activeMinter && userAddress.toLowerCase() === activeMinter.toLowerCase())
  );
  const activeIsFollowing =
    followOverrides[activeMinter.toLowerCase()] ?? !!(activeItem as any)?.isFollowing;
  const activeIsHidden =
    hiddenOverrides[String(activeTokenId)] ?? !!(activeItem as any)?.isHidden;

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
      setInitialLoading(false);
    }
  }, [page, feedParams]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleCycleSpeed = useCallback(() => {
    setPlaybackRate((rate) => {
      const idx = PLAYBACK_RATES.indexOf(rate as any);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    });
  }, []);

  /** Bookmark lives in the options menu here, as it does on web. */
  const handleToggleSave = useCallback(() => {
    if (activeTokenId == null) return;
    requireAuth(() => {
      const key = engagementKeyOf(activeItem);
      const wasSaved = activeEngagement.isSaved;
      applyEngagement(key, { isSaved: !wasSaved });
      const rollback = () => {
        revertEngagement(key, { isSaved: wasSaved });
        toastError("Failed to save");
      };
      savePost(Number(activeTokenId), userAddress)
        .then((res) => {
          if (isFailedResponse(res)) {
            rollback();
            return;
          }
          toastSuccess(wasSaved ? "Removed from saved" : "Saved");
        })
        .catch(rollback);
    });
  }, [activeItem, activeTokenId, activeEngagement.isSaved, userAddress, requireAuth]);

  const handleFollowChange = useCallback((following: boolean) => {
    if (!activeMinter) return;
    setFollowOverrides((prev) => ({ ...prev, [activeMinter.toLowerCase()]: following }));
  }, [activeMinter]);

  const handleVisibilityChange = useCallback((hidden: boolean) => {
    setHiddenOverrides((prev) => ({ ...prev, [String(activeTokenId)]: hidden }));
  }, [activeTokenId]);

  const handleEditSuccess = useCallback((data: { name?: string; description?: string; category?: string[] }) => {
    setItems((prev) => prev.map((it) => (
      (it.tokenId ?? it.id) === activeTokenId
        ? {
            ...it,
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.category !== undefined ? { category: data.category } : {}),
          }
        : it
    )));
  }, [activeTokenId]);

  const handleDeleteSuccess = useCallback(() => {
    setShowOptionsMenu(false);
    setItems((prev) => {
      const next = prev.filter((it) => (it.tokenId ?? it.id) !== activeTokenId);
      if (next.length === 0) navigation.goBack();
      return next;
    });
    setActiveIndex((i) => Math.max(0, i - 1));
  }, [activeTokenId, navigation]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const listRef = useRef<FlatList>(null);

  const renderFooter = useCallback(() => {
    if (!noMoreShorts || items.length === 0) return null;
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
        <Text className="text-white/60 text-xs mt-1">
          Check back later for more shorts
        </Text>
      </View>
    );
  }, [noMoreShorts, items.length, containerHeight]);

  const renderEmpty = useCallback(() => {
    if (initialLoading) return null;
    return (
      <View
        style={{
          width: SCREEN_WIDTH,
          height: containerHeight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="Film" size={48} color="rgba(255,255,255,0.3)" />
        <Text className="text-white/50 text-sm mt-3 font-medium">
          You're all caught up
        </Text>
        <Text className="text-white/60 text-xs mt-1">
          Check back later for more shorts
        </Text>
      </View>
    );
  }, [initialLoading, containerHeight]);

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
        isMuted={isMuted}
        playbackRate={playbackRate}
        bottomInset={insets.bottom}
        onChromeVisibilityChange={setChromeVisible}
      />
    ),
    [activeIndex, containerHeight, isMuted, playbackRate, insets.bottom, setChromeVisible],
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
        ListEmptyComponent={renderEmpty}
        removeClippedSubviews
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        getItemLayout={getItemLayout}
      />

      {/* Fixed header overlay – back left, playback chrome right (as on web).
          box-none so only the buttons themselves take touches; the rest of the
          strip stays with the video underneath. Every button is the same 40pt
          square in the same glass as the bottom bar; the speed pill only differs
          in width, and keeps the height so the group reads as one row. */}
      {chromeVisible && (
        <>
          {/* Mirror of the bottom scrim — the top buttons had nothing behind
              them, so they washed out over a bright first frame. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.55)", "transparent"]}
            style={[styles.topGradient, { height: insets.top + 96 }]}
            pointerEvents="none"
          />

          <View style={[styles.topBar, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
            <Pressable onPress={handleBack} hitSlop={CHROME_HIT_SLOP} style={styles.topButton} accessibilityLabel="Back">
              <ChromeFill />
              <Icon name="ChevronLeft" size={22} color="#fff" />
            </Pressable>

            <View style={styles.topRight}>
              <Pressable
                onPress={handleCycleSpeed}
                hitSlop={CHROME_HIT_SLOP}
                style={[styles.topButton, styles.speedButton]}
                accessibilityLabel="Playback speed"
              >
                <ChromeFill />
                <Text style={styles.speedButtonText}>{formatRate(playbackRate)}</Text>
              </Pressable>

              <Pressable
                onPress={() => setIsMuted((m) => !m)}
                style={styles.topButton}
                hitSlop={CHROME_HIT_SLOP}
                accessibilityLabel={isMuted ? "Unmute" : "Mute"}
              >
                <ChromeFill />
                <Icon name={isMuted ? "VolumeX" : "Volume2"} size={19} color="#fff" />
              </Pressable>

              <Pressable
                onPress={() => setShowOptionsMenu(true)}
                style={styles.topButton}
                hitSlop={CHROME_HIT_SLOP}
                accessibilityLabel="More options"
              >
                <ChromeFill />
                <Icon name="Ellipsis" size={19} color="#fff" />
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* Initial-load spinner — the first page is still in flight. */}
      {initialLoading && items.length === 0 && (
        <View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: "center", justifyContent: "center" },
          ]}
          pointerEvents="none"
        >
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Options menu — bookmark, follow, report, block and the owner actions,
          matching the web viewer's options drawer. */}
      {showOptionsMenu && !!activeItem && (
        <PostOptionsMenu
          visible={showOptionsMenu}
          onClose={() => setShowOptionsMenu(false)}
          tokenId={activeTokenId}
          isOwner={isOwnerOfActive}
          isHidden={activeIsHidden}
          creatorDisplayName={activeDisplayName}
          creatorIdentifier={activeMinter || activeUsername || ""}
          isFollowing={activeIsFollowing}
          currentTitle={activeItem.name || activeItem.title || ""}
          currentDescription={activeItem.description || ""}
          currentCategories={activeItem.category || []}
          isSaved={activeEngagement.isSaved}
          onToggleSave={handleToggleSave}
          onFollowChange={handleFollowChange}
          onVisibilityChange={handleVisibilityChange}
          onEditSuccess={handleEditSuccess}
          onDeleteSuccess={handleDeleteSuccess}
        />
      )}
    </View>
  );
};

export default ShortsViewerScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  chromeFill: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: CHROME_BORDER,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: EDGE,
    paddingBottom: 10,
    zIndex: 20,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_GAP,
  },
  topButton: {
    width: CHROME_SIZE,
    height: CHROME_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  // Wider than the icon buttons but the same height, so the group's baseline
  // and cap line stay flush.
  speedButton: {
    width: undefined,
    minWidth: 46,
    paddingHorizontal: 12,
  },
  speedButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  bottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // Shorter than it was: the action bar carries its own contrast now, so the
    // scrim only has to cover the caption instead of washing out half the video.
    height: "34%",
    zIndex: 5,
  },
  bottomStack: {
    position: "absolute",
    left: EDGE,
    right: EDGE,
    bottom: 0,
    zIndex: 10,
  },
  captionBlock: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  actionBarWrap: {
    height: BAR_HEIGHT,
  },
  actionBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 4,
  },
  /** Equal share of the bar — this is what puts the icons on a fixed grid. */
  actionCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  /** Content-sized variant, so the reaction tray anchors to the thumb. */
  actionInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 11,
  },
  actionGlyph: {
    fontSize: 17,
    lineHeight: 22,
    width: 19,
    textAlign: "center",
  },
  actionCount: {
    color: COUNT_COLOR,
    fontSize: 11,
    fontWeight: "500",
  },
  // Same square-with-a-hairline as the top buttons, so the avatar belongs to
  // the chrome rather than sitting in a shape of its own.
  avatar: {
    width: CHROME_SIZE,
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    borderWidth: 1,
    borderColor: CHROME_BORDER,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
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
