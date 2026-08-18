/**
 * Shorts Viewer — full-screen vertical carousel.
 *
 * The chrome mirrors the web viewer (dehubweb
 * src/components/app/cards/ShortsViewer.tsx): a horizontal action row spread
 * across the bottom of the frame in feed-card order — views · tip · dislike ·
 * share · comments · like, with like at the far right for thumb reach — and the
 * creator row + caption stacked above it. Back sits top-left; playback speed,
 * mute and the options menu top-right. Bookmark and the moderation actions live
 * in that menu rather than on the row, as on web.
 *
 * What web puts a fill behind is exactly the four top buttons, and nothing
 * else: the action row is bare icons with a text shadow over the bottom scrim.
 * This screen used to draw a glass slab under that row too, which is what made
 * it read as a different app. The action row's six cells are still equal flex
 * shares rather than `space-between` over content-sized children, so the icons
 * hold a fixed grid no matter how wide the counts under them get, with the two
 * end cells aligned outwards so the row still spans edge to edge.
 *
 * Every margin is a flat EDGE with no safe-area inset added — see the EDGE
 * comment; the navigator already sits inside a SafeAreaView.
 *
 * Two gestures clear and restore the chrome, both ported from web: swipe down
 * over the bottom stack to clear it, tap the middle band to bring it back.
 * Holding the middle of the frame still hides it for a screenshot for as long
 * as the finger is down. See HIDE_SWIPE_MIN / RESTORE_ZONE_TOP.
 *
 * Engagement goes through the shared overlay (libs/engagementCache) instead of
 * local state, so a like cast here is the same like the feed card shows — the
 * mobile equivalent of web's vote cache.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { NativeGesture } from "react-native-gesture-handler";
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
  getShortsThumbnailUrl,
  getAvatarUrl,
  formatCompactNumber,
  toastError,
  toastSuccess,
  copyToClipboard,
} from "../libs";
import { voteOnNFT, reactToNFT, getNFT } from "../services/nft.service";
import ReactionPicker from "../components/Home/ReactionPicker";
import ReactionInfoSheet from "../components/Home/ReactionInfoSheet";
import ShareSheet from "../components/Home/ShareSheet";
import PostOptionsMenu from "../components/common/PostOptionsMenu";
import Avatar from "../components/common/Avatar";
import {
  applyReactionDelta,
  isPositiveReaction,
  reactionForTap,
  reactionMeta,
  resolveLeadReaction,
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
// Web's `text-white/70` on every count under the action row.
const COUNT_COLOR = "rgba(255,255,255,0.7)";

/**
 * One margin for the whole frame.
 *
 * Web hangs every piece of chrome off a single 16px margin — `top-4 left-4`
 * on the back button, `top-4 right-4` on the playback group, `px-4` on the
 * caption and the action row — and closes the bottom with
 * `pb-[max(1rem,env(safe-area-inset-bottom))]`, i.e. 16 unless the device
 * needs more.
 *
 * Here it is a flat 16 on all four sides, with no `insets.*` added, because
 * `App.tsx` wraps the whole NavigationContainer in a full-edge `SafeAreaView`
 * (App.tsx:269) — this screen is an ordinary card inside that navigator, so
 * the notch and the home indicator are already paid for before it mounts.
 * `useSafeAreaInsets()` still reports the *full* device inset to descendants
 * of a SafeAreaView (only SafeAreaProvider narrows it), so the old
 * `insets.top + 10` / `insets.bottom + 10` spent it a second time at both
 * ends and left the two bars floating well clear of the edges.
 */
const EDGE = 16;

/** Web `gap-3` between the top-right buttons. */
const CHROME_GAP = 12;
/** Web `w-10 h-10` / `rounded-xl` on every top button. */
const CHROME_SIZE = 40;
const CHROME_RADIUS = 12;
/** Web `bg-zinc-900/60 backdrop-blur-sm`, and nothing else — no hairline. */
const CHROME_FILL = "rgba(24,24,27,0.6)";
// Takes the 40pt buttons past the 44pt tap minimum. The horizontal half is
// exactly CHROME_GAP / 2, so neighbours in the top-right group meet at the
// midpoint of the gap instead of overlapping and stealing each other's taps.
const CHROME_HIT_SLOP = { top: 6, bottom: 6, left: CHROME_GAP / 2, right: CHROME_GAP / 2 };

/**
 * Web leans on `drop-shadow-lg` to keep white overlay text legible over an
 * arbitrary video frame. RN has no filter, so the same job is done with a
 * text shadow on the type and the bottom scrim behind it.
 */
const TEXT_SHADOW = {
  textShadowColor: "rgba(0,0,0,0.55)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

/**
 * Swipe down over the bottom stack to clear the chrome, then tap the middle
 * band to bring it back — the same two gestures web runs (ShortsViewer.tsx
 * `handleOverlayGestureTouch*` / `handleRestoreTouch*`), with web's own
 * thresholds.
 *
 * RN and the DOM differ in the one way that matters here. On web the overlay
 * is `pointer-events-auto` above the carousel's drag layer, so a drag that
 * begins on the caption never reaches it. In RN a cell's child does not
 * shield the paging FlatList, so the same drag would page to the previous
 * short *and* clear the chrome.
 *
 * Winning that race takes gesture-handler, not RN's own responder system.
 * A JS responder cannot get there in time: Android's ScrollView intercepts at
 * the 8dp touch slop and `notifyNativeGestureStarted` then stops delivering
 * touches to JS entirely, and on iOS RCTScrollView cancels the JS touch
 * stream when its pan recognizer begins. So the claim is a manually-activated
 * `Gesture.Pan`, deciding on the UI thread the same way ImageFeedDrawer's
 * `contentPan` does, and declaring `blocksExternalGesture` against the pager
 * so the list has to wait for this gesture to fail before it scrolls.
 *
 * Because the relation makes the pager *wait*, there is no race left to win
 * and the thresholds can be comfortable rather than hair-trigger. The cost is
 * that the pager is held for as long as this gesture stays undecided, so the
 * direction has to be resolved quickly and released the moment it is not a
 * downward drag — hence a small RELEASE threshold against a larger CLAIM one.
 * Get that wrong and the whole bottom stack becomes a paging dead zone.
 *
 * HIDE_SWIPE_MIN stays at web's 40 as the commit threshold: a drag shorter
 * than that simply does nothing and the chrome stays put.
 */
const HIDE_SWIPE_MIN = 40;
/** Downward travel that makes the drag ours. Above a tap's incidental drift. */
const DRAG_CLAIM_MIN = 16;
/** Travel in any other direction that hands the drag straight back to the pager. */
const DRAG_RELEASE_MIN = 6;
const RESTORE_ZONE_TOP = 0.55;
const RESTORE_ZONE_BOTTOM = 0.85;

/**
 * The glass behind a top button, as an absolutely-positioned sibling rather
 * than a wrapper, so `pointerEvents="none"` lets taps on the button's own
 * padding still reach the video underneath.
 *
 * Only the top row uses it. Web puts `bg-zinc-900/60 backdrop-blur-sm` behind
 * its four playback controls and nothing at all behind the action row — the
 * icons there are bare, and the bottom scrim plus a text shadow does the
 * legibility work. The slab this viewer used to draw under the action row was
 * the single biggest thing making it read as a different app.
 *
 * The Android backdrop blur is deliberately absent. `dimezisBlurView`
 * re-snapshots the root view every frame and throws when a list mutates its
 * children mid-draw, so it is only safe on surfaces that mount and unmount
 * (see components/ui/LiquidGlass.tsx) — never on chrome pinned over a video
 * feed that is recycling cells. The 60% fill carries the contrast on its own.
 */
const ChromeFill: React.FC = () => (
  <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.chromeFill]}>
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
      // No hitSlop: the cell carries `minHeight: 44` and an equal share of the
      // row's width (~56pt), so it already clears the 44pt minimum on its own,
      // and slop here would make adjacent cells overlap and steal each other's
      // taps. If that minHeight ever goes, this needs slop instead.
      style={style ?? styles.actionCell}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {glyph ? (
          <Text style={styles.actionGlyph}>{glyph}</Text>
        ) : (
          // Web's `w-5 h-5`.
          <Icon
            name={icon}
            size={20}
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
  /**
   * The pager's own gesture, so the swipe-down can declare that the list must
   * wait on it rather than race it. See hidePan.
   */
  pagerGesture: NativeGesture;
  /**
   * Reports the hide-the-chrome state up to the screen, so the top bar and its
   * scrim disappear with the bottom stack. They live outside this component
   * and used to stay on screen through a "hide the chrome" gesture.
   */
  onChromeVisibilityChange: (visible: boolean) => void;
}

const ShortItem = React.memo<ShortItemProps>(({ item, isActive, itemHeight, isMuted, playbackRate, pagerGesture, onChromeVisibilityChange }) => {
  const navigation = useNavigation<any>();
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();

  const tokenId = item.tokenId ?? item.id;
  const videoUrl = getVideoUrl(tokenId) || undefined;
  const thumbnail = getShortsThumbnailUrl(tokenId);
  const minterAddress = item.minter || item.minterUser?.address || "";

  // `getAvatarUrl` answers the literal string "default-avatar" — not a URI —
  // when a creator has none, and it routes real URLs through the CDN image
  // transform, which 404s outright if the zone setting is ever off. Both used
  // to go straight into a bare expo-image with no background and no onError,
  // so the slot painted nothing at all over the video. Guarding the sentinel
  // and handing the rest to the shared Avatar is what every other surface in
  // the app does (FeedCardHeader, CommentItem, ProfileHeader…), and it brings
  // the initial-letter fallback web draws in AvatarFallback with it.
  const avatarUrl = (() => {
    const resolved = getAvatarUrl(item.minterUser?.avatarImageUrl || item.minterAvatarUrl, 48);
    return resolved && resolved !== "default-avatar" ? resolved : undefined;
  })();
  const username = item.minterUser?.username || item.minterUsername || "";
  // Five deep and ending somewhere visible, matching FeedCard — the chain
  // stopped at `username` here, so a row that came back with only an address
  // rendered an empty name and, because the handle is conditional, no author
  // line whatever.
  const displayName =
    item.minterUser?.displayName ||
    item.minterDisplayName ||
    username ||
    (minterAddress ? `${minterAddress.slice(0, 6)}…${minterAddress.slice(-4)}` : "") ||
    "Unknown";
  // The title carries the caption in practice: UploadScreen puts the composer
  // body into `name` and leaves `description` empty unless the author fills in
  // a separate one, so almost every live short has text here and nothing in
  // `description`. Web's mobile overlay renders only the description — this
  // one has to render both, or most shorts show no text at all.
  //
  // Trimmed before the emptiness test as well as the "untitled" one: a
  // whitespace-only name passes a bare truthiness check and draws a blank line
  // above the caption.
  const title = (() => {
    const raw = (item.name || item.title || "").trim();
    return raw.toLowerCase() === "untitled" ? "" : raw;
  })();
  const description = (item.description || "").trim();
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
  /** Swipe-down-to-clear, web's `overlaysHidden`. Separate from screenshotMode
   *  (a hold) because the two are different ways into the same state and only
   *  the swipe one survives the finger coming off the glass. */
  const [overlaysHidden, setOverlaysHidden] = useState(false);

  /** Faded rather than unmounted, so the chrome does not re-layout on the way
   *  back in — web animates the same 250ms easeOut opacity. */
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  /** Touch origin for the swipe-down, read on the UI thread by hidePan. */
  const panStart = useSharedValue({ x: 0, y: 0 });

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

  /**
   * Tapping a thumb casts whichever reaction it is WEARING — a short leading
   * with 🔥 reacts 🔥, not a 👍 the viewer never picked — and re-sending a
   * reaction you already hold is what toggles it off.
   */
  const togglePolarity = useCallback((positive: boolean) => {
    handleReaction(reactionForTap(positive, myReaction, reactionCounts));
  }, [handleReaction, myReaction, reactionCounts]);

  const handleLike = useCallback(() => togglePolarity(true), [togglePolarity]);
  const handleDislike = useCallback(() => togglePolarity(false), [togglePolarity]);

  /** The one glyph the thumb wears — and, on a tap, the reaction it casts. */
  const leadReaction = resolveLeadReaction(reactionCounts, myReaction);
  const leadGlyph = leadReaction ? reactionMeta(leadReaction).emoji : undefined;
  /** A 👎 or 💩 belongs to the thumbs-DOWN; this button must not announce it. */
  const myPositiveReaction = myReaction && isPositiveReaction(myReaction) ? myReaction : null;

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

  /**
   * Swipe down over the bottom stack to clear the chrome — web's
   * `handleOverlayGestureTouch*`. See the HIDE_SWIPE_MIN block above for why
   * this is a gesture-handler Pan and not a PanResponder.
   *
   * Manual activation, and never on touch-down, so the buttons underneath keep
   * their taps: the gesture only claims once the finger has clearly travelled
   * downwards.
   *
   * Unlike ImageFeedDrawer's contentPan — which stays in BEGAN on a
   * non-matching move and lets the native scroll take it — this one must fail
   * explicitly, because `blocksExternalGesture` holds the pager for exactly as
   * long as this gesture is undecided. Sitting in BEGAN would leave the pager
   * waiting until the finger lifted, and the bottom stack, which is where a
   * thumb rests, would stop paging altogether.
   */
  const hidePan = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          "worklet";
          // First finger only: a second one landing mid-drag would otherwise
          // re-seat the origin and reset the travel measured so far.
          if (e.numberOfTouches !== 1) return;
          panStart.value = { x: e.allTouches[0]?.x ?? 0, y: e.allTouches[0]?.y ?? 0 };
        })
        .onTouchesMove((e, state) => {
          "worklet";
          const t = e.allTouches[0];
          if (!t || e.numberOfTouches !== 1) return;
          const dy = t.y - panStart.value.y;
          const dx = Math.abs(t.x - panStart.value.x);
          // Anything that is not a downward drag belongs to the pager — hand
          // it back at once rather than making it wait on us.
          if (dy < -DRAG_RELEASE_MIN || dx > Math.abs(dy) + DRAG_RELEASE_MIN) {
            state.fail();
            return;
          }
          if (dy > DRAG_CLAIM_MIN && dy > dx) state.activate();
        })
        .onEnd((e, success) => {
          "worklet";
          // `onEnd` also runs for a cancelled gesture; only a real release
          // should clear the chrome.
          if (!success) return;
          if (e.translationY > HIDE_SWIPE_MIN && e.translationY > Math.abs(e.translationX)) {
            runOnJS(setOverlaysHidden)(true);
          }
        })
        // Makes the pager wait on this gesture instead of racing it. Without
        // it the list still wins on iOS, where a handler living inside the
        // scroll view cannot disable it on its own.
        //
        // It has to be the pager's *gesture*, never the FlatList's ref.
        // `convertToHandlerTag` resolves a relation by reading `.handlerTag`
        // off the target and answers -1 for anything without one, which
        // `extractValidHandlerTags` then filters out — so a plain RN
        // component ref is discarded in silence and the relation never
        // reaches native. Same reasoning as useHorizontalScrollGuard in
        // context/PagerGestureContext.tsx.
        .blocksExternalGesture(pagerGesture),
    [panStart, pagerGesture],
  );

  // Handle screen tap — double tap = like, single tap = play/pause
  const handleScreenPress = useCallback((e: GestureResponderEvent) => {
    if (longPressActiveRef.current) return;
    // A tap that dismisses the reaction tray is not also a play/pause.
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    const { pageX, pageY } = e.nativeEvent;
    // Tap the middle band to bring cleared chrome back — web's
    // `handleRestoreTouchEnd`. It restores on a tap rather than an upward
    // swipe because an upward flick is exactly the gesture that pages to the
    // next short, and the two fought; and the band stops short of the bottom
    // 15% so a restore tap never lands on the action row. Returning here is
    // what keeps the same tap from also toggling playback — web suppresses
    // the follow-on tap for 400ms for the same reason.
    if (overlaysHidden) {
      if (
        pageY > SCREEN_HEIGHT * RESTORE_ZONE_TOP &&
        pageY < SCREEN_HEIGHT * RESTORE_ZONE_BOTTOM
      ) {
        setOverlaysHidden(false);
      }
      return;
    }
    const now = Date.now();
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
  }, [liked, handleLike, showLikeAnimation, pickerOpen, overlaysHidden]);

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

  const chromeVisible = !screenshotMode && !overlaysHidden;

  // Swiping to another short brings the chrome back with it, so a cleared
  // frame never carries over to the next one.
  useEffect(() => {
    if (isActive) return;
    setOverlaysHidden(false);
    setCaptionExpanded(false);
  }, [isActive]);

  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: chromeVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, chromeOpacity]);

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

      {/* Faded, not unmounted: the swipe-down clear and the restore tap both
          animate this, and keeping it mounted means nothing re-lays-out on the
          way back. pointerEvents goes with it so a cleared frame cannot be
          tapped through an invisible avatar. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: chromeOpacity }]}
        pointerEvents={chromeVisible ? "box-none" : "none"}
      >
        {/* Legibility gradient behind the bottom stack, as on web. */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Creator info + caption, with the action row as the bottommost
            element.

            The stack takes touches rather than being box-none, which is both
            what web does (`pointer-events-auto` on its caption and action row,
            `none` only on the wrapper) and what the swipe-down needs. On
            Android gesture-handler runs its own hit test, and under BOX_NONE
            it records a view's handlers only if some descendant was itself a
            valid target — background-less Views never are, and an Icon is SVG
            rather than child Views, so the handler would only ever be reached
            through the text leaves. Empty pixels between the icons, which is
            most of the row, would silently not start the gesture.

            The trade is explicit: these pixels can start the swipe or fall
            through to the video, not both. Web makes the same one. */}
        <GestureDetector gesture={hidePan}>
          <View style={styles.bottomStack}>
            <View style={styles.captionBlock}>
              <Pressable onPress={handleUserPress} style={styles.creatorRow}>
                {/* The shared Avatar, not a bare expo-image: it guards the
                    "default-avatar" sentinel, falls back to the initial on a
                    load error, and carries a recyclingKey so a reused cell never
                    shows the previous creator's face. Web's equivalent is the
                    Avatar/AvatarFallback pair at w-12 h-12 rounded-xl. */}
                <Avatar
                  uri={avatarUrl}
                  name={displayName}
                  size={48}
                  style={styles.avatar}
                />
                <View style={styles.creatorText}>
                  <Text numberOfLines={1} style={styles.creatorName}>
                    {displayName}
                  </Text>
                  {username ? (
                    <Text numberOfLines={1} style={styles.creatorHandle}>
                      @{username}
                    </Text>
                  ) : null}
                </View>
              </Pressable>

              {title || description ? (
                <Pressable onPress={() => setCaptionExpanded((p) => !p)} hitSlop={8}>
                  {title ? (
                    <Text
                      numberOfLines={captionExpanded ? undefined : 1}
                      style={styles.captionTitle}
                    >
                      {title}
                    </Text>
                  ) : null}
                  {description ? (
                    <Text
                      numberOfLines={captionExpanded ? undefined : 2}
                      style={styles.captionBody}
                    >
                      {description}
                    </Text>
                  ) : null}
                  {/* Web shows the affordance on a long description; the title
                      is clamped to one line here, so a long one earns it too —
                      otherwise a clamped caption offers no hint it opens. */}
                  {description.length > 80 || title.length > 40 ? (
                    <Text style={styles.captionMore}>
                      {captionExpanded ? "less" : "more"}
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}
            </View>

            {/* Action row — bare icons over the scrim, no slab. Web draws this
                as `flex items-center justify-between` with nothing behind it;
                the glass tray that used to sit here is what made the viewer read
                as a different app from the web one.

                The cells are still equal flex shares rather than
                `justify-between` over content-sized children, because a count
                growing from "9" to "12.4K" shoved every icon beside it sideways.
                The first and last cell align to their outer edges, so the row
                still starts and ends flush with the caption above it exactly as
                web's does. */}
            <View style={styles.actionBar}>
              {/* Views — a readout, not a button, as on web. */}
              <View style={[styles.actionCell, styles.actionCellFirst]}>
                <Icon name="Eye" size={20} color={ICON_COLOR} strokeWidth={1.8} />
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
                  positioning context and stays button-sized, so the tray anchors
                  to the thumb rather than to the whole cell. The tray keeps
                  itself inside the screen from there. */}
              <View style={[styles.actionCell, styles.actionCellLast]}>
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
                      myPositiveReaction
                        ? `${reactionMeta(myPositiveReaction).label} — hold to change your reaction`
                        : `${reactionMeta(leadReaction ?? "like").label} — hold to react`
                    }
                  />
                </View>
              </View>
            </View>
          </View>
        </GestureDetector>
      </Animated.View>

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
  // Clearing a short's chrome — by holding the middle of it, or by the
  // swipe-down — is reported up so the top bar goes with it.
  const [chromeVisible, setChromeVisible] = useState(true);
  const topChromeOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(topChromeOpacity, {
      toValue: chromeVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [chromeVisible, topChromeOpacity]);

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
    activeItem?.minterUser?.displayName ||
    activeItem?.minterDisplayName ||
    activeUsername ||
    (activeMinter ? `${activeMinter.slice(0, 6)}…${activeMinter.slice(-4)}` : "");
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

  /**
   * Fill in a caller that handed us only a tokenId.
   *
   * NotificationScreen navigates here with `[{ tokenId, postType: 'short' }]`
   * and nothing else (NotificationScreen.tsx:744-753). The video still plays,
   * because its URL is derived from the tokenId alone — but the avatar, the
   * creator name, the title, the description and every count come from the
   * payload, so that short renders as a playing video with no author and no
   * text at all. `loadMore` only ever appends, so nothing else ever fixes it:
   * swipe once and the fetched shorts are complete, which is why it looks
   * intermittent.
   *
   * Hydrating here rather than in the caller covers every future thin caller
   * too. The existing fields win over the fetched ones so anything the caller
   * did know stays authoritative.
   */
  useEffect(() => {
    const seed = items[0];
    if (!seed || items.length !== 1) return;
    if (seed.minterUser || seed.minterAvatarUrl || seed.name) return;
    const id = seed.tokenId ?? seed.id;
    if (id == null) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await getNFT(id);
        const payload = (res?.result || res) as any;
        if (cancelled || !payload || typeof payload !== "object") return;
        setItems((prev) =>
          prev.map((it, i) =>
            i === 0
              ? {
                  ...payload,
                  // `/nft_info/:id` answers `mintername`, not `minterUsername`
                  // — without this the username fallback rung is dead on a
                  // hydrated item.
                  minterUsername: payload.minterUsername || payload.mintername,
                  ...it,
                }
              : it,
          ),
        );
      } catch {
        // The video still plays; leaving the husk beats blanking the screen.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once, on mount — a later append must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /**
   * The pager, as something a gesture relation can actually name.
   *
   * A relation resolves through `.handlerTag`, which only gesture-handler's
   * own objects and its wrapped components carry — a bare FlatList ref
   * resolves to -1 and is dropped without a warning. Wrapping the list in a
   * Native gesture gives each short's swipe-down a real handler to block, so
   * the pager waits for that gesture to fail instead of racing it. Same shape
   * as useHorizontalScrollGuard in context/PagerGestureContext.tsx, from the
   * other side of the relation.
   */
  const pagerGesture = useMemo(() => Gesture.Native(), []);

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
        pagerGesture={pagerGesture}
        onChromeVisibilityChange={setChromeVisible}
      />
    ),
    [activeIndex, containerHeight, isMuted, playbackRate, pagerGesture, setChromeVisible],
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

      {/* The Native gesture is what makes the pager nameable in a relation —
          see pagerGesture. It wraps the list without changing how it scrolls. */}
      <GestureDetector gesture={pagerGesture}>
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
      </GestureDetector>

      {/* Fixed header overlay – back left, playback chrome right (as on web).
          box-none so only the buttons themselves take touches; the rest of the
          strip stays with the video underneath. Every button is the same 40pt
          square in the same `bg-zinc-900/60` glass web gives them; the speed
          pill only differs in width, and keeps the height so the group reads as
          one row.

          It fades on the same 250ms curve as the bottom stack rather than
          unmounting, so clearing the chrome is one movement across the whole
          frame instead of a pop at the top and a fade at the bottom. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: topChromeOpacity }]}
        pointerEvents={chromeVisible ? "box-none" : "none"}
      >
        {/* Mirror of the bottom scrim — the top buttons had nothing behind
            them, so they washed out over a bright first frame. Its height is
            a constant now for the same reason the bar's padding is: the
            device inset was already spent by the root SafeAreaView. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "transparent"]}
          style={styles.topGradient}
          pointerEvents="none"
        />

        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable onPress={handleBack} hitSlop={CHROME_HIT_SLOP} style={styles.topButton} accessibilityLabel="Back">
            <ChromeFill />
            {/* Web's `w-6 h-6` on the back chevron — larger than the three
                playback controls opposite it, as there. */}
            <Icon name="ChevronLeft" size={24} color="#fff" />
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
              <Icon name={isMuted ? "VolumeX" : "Volume2"} size={20} color="#fff" />
            </Pressable>

            <Pressable
              onPress={() => setShowOptionsMenu(true)}
              style={styles.topButton}
              hitSlop={CHROME_HIT_SLOP}
              accessibilityLabel="More options"
            >
              <ChromeFill />
              <Icon name="Ellipsis" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Animated.View>

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
    borderRadius: CHROME_RADIUS,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 96,
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
    // Web's `top-4 left-4 right-4`, flat — see the EDGE comment for why no
    // inset is added on top of it.
    paddingTop: EDGE,
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
  // Web's `h-10 min-w-[40px] px-1.5`: it grows past the square only when the
  // rate needs the room ("1.25x"), and keeps the height so the group's
  // baseline and cap line stay flush.
  speedButton: {
    width: undefined,
    minWidth: CHROME_SIZE,
    paddingHorizontal: 6,
  },
  // Web's `text-[11px] font-bold`.
  speedButtonText: {
    color: "#fff",
    fontSize: 11,
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
    // Web closes the frame with `pb-[max(1rem,env(safe-area-inset-bottom))]`.
    // Inside the root SafeAreaView that resolves to a flat 16 — the old
    // `insets.bottom + 10` was the notch charged twice.
    bottom: EDGE,
    zIndex: 10,
  },
  captionBlock: {
    // Web's `mb-3`, both between the creator row and the caption and between
    // the caption and the action row. It is a gap rather than a margin on
    // creatorRow because the caption is conditional, and Yoga does not
    // collapse a trailing margin — a short with neither title nor description
    // ended up with 24pt of air above the action row instead of 12.
    gap: 12,
    marginBottom: 12,
  },
  // Web's `gap-2`.
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  creatorText: {
    flex: 1,
  },
  // Web: `text-base font-semibold` over `text-sm text-white/70`, both with
  // `leading-tight` and a drop shadow.
  creatorName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
    ...TEXT_SHADOW,
  },
  creatorHandle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    lineHeight: 18,
    ...TEXT_SHADOW,
  },
  // Web's caption is `text-sm leading-relaxed`; the title carries the same
  // size at a heavier weight so it reads as the headline of the two.
  captionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 2,
    ...TEXT_SHADOW,
  },
  captionBody: {
    color: "#fff",
    fontSize: 14,
    lineHeight: 20,
    ...TEXT_SHADOW,
  },
  captionMore: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginTop: 4,
    ...TEXT_SHADOW,
  },
  // No wrapper and no fixed height any more: without a slab to fill, the row
  // is exactly as tall as its tallest cell.
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  /**
   * Equal share of the row — this is what puts the icons on a fixed grid.
   *
   * `minHeight`, not vertical padding: the slab used to give every cell a
   * fixed 46pt through `alignItems: "stretch"` inside it, and taking the slab
   * away took the height with it. Padding around a 20pt icon would leave the
   * buttons at 32pt, under both the 44pt iOS minimum and Android's 48dp, on
   * the one surface a viewer actually thumbs. 44 also lands the row within
   * 2pt of the old height, so nothing above it moves.
   */
  actionCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
  },
  /** The outer cells align to the caption's edges, as web's `justify-between`
   *  does, while the middle four stay centred in their share. */
  actionCellFirst: {
    justifyContent: "flex-start",
  },
  actionCellLast: {
    justifyContent: "flex-end",
  },
  /**
   * Content-sized variant, so the reaction tray anchors to the thumb. Carries
   * the same 44pt floor as the cell rather than padding on top of it — the
   * two nest, and padding on both made the outer box 44 while leaving the
   * Pressable inside it at 32.
   *
   * `minWidth` as well, which the flex cells get from their equal share and
   * this one does not: it is the only button sized by its content, so on a
   * short with no likes yet it was a 20pt icon plus a "0" — about 31pt wide,
   * on the most-tapped control on the screen.
   */
  actionInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
    minWidth: 44,
  },
  actionGlyph: {
    fontSize: 17,
    lineHeight: 22,
    width: 20,
    textAlign: "center",
  },
  // Web's `text-xs font-medium text-white/70 drop-shadow-lg`.
  actionCount: {
    color: COUNT_COLOR,
    fontSize: 12,
    fontWeight: "500",
    ...TEXT_SHADOW,
  },
  // Web's `w-12 h-12 rounded-xl`. Avatar derives its own radius from the size
  // (16% → 8), so the 12 web draws is set here.
  avatar: {
    borderRadius: 12,
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
