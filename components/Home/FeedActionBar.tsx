import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, View, Pressable, Text } from "react-native";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";
import ReactionPicker from "./ReactionPicker";
import {
  reactionMeta,
  resolveLeadReaction,
  resolveThumbReaction,
  resolveThumbCount,
  type PostReaction,
  type ReactionCounts,
} from "../../libs/reactions";
import { ReactionEmoji } from "./ReactionEmoji";
import { haptic } from "../../libs/haptics";
import { maybeShowReactionTip, markReactionTipSeen } from "../../libs/reaction-tip";
import { useAppPrefs } from "../../hooks/useAppPrefs";
import { subscribePostTipped } from "../../libs/tip-events";
import { TipGemIcon } from "./TipGemIcon";
import { getActiveTheme } from "../../theme/colors";
import { getThemeSkin, MONO_TEXT } from "../../theme/skins";
import { useViewerTippedPost } from "../../hooks/useViewerTippedPost";
import { useCellState } from "../../hooks/useCellState";

const ICON_MUTED = "#6F7174";
const ICON_ACTIVE = "#F9FBFF";
const COUNT_COLOR = "#8B8D90";

interface FeedActionBarProps {
  liked: boolean;
  disliked: boolean;
  saved: boolean;
  reposted: boolean;
  likeCount: number;
  dislikeCount?: number;
  commentCount: number;
  repostCount: number;
  /**
   * Reposts + link copies. A copy of the post URL is a share too, so the
   * button carries both; falls back to the repost count when a surface has
   * not loaded copy data.
   */
  shareCount?: number;
  tipCount: number;
  /** Tap on the thumb: casts what it wears, or takes back what you hold (👎 included). */
  onLike: () => void;
  onComment: () => void;
  /** Touch-down on the comment button — a head start on the thread's reads. */
  onCommentPressIn?: () => void;
  /** Opens the Share sheet (repost / quote / copy-link / send-in-DM / share-as-image). */
  onShare: () => void;
  onTip?: () => void;
  /** The post's token id — lets the tip gem react when this viewer tips it. */
  tokenId?: number | string | null;
  /** Viewer wallet, to light the gem for a tip made before this load. */
  viewerAddress?: string | null;
  onSave: () => void;
  onInfo: () => void;
  /** Which of the ten reactions the viewer holds. `liked`/`disliked` are its polarity. */
  myReaction?: PostReaction | null;
  /** Per-reaction totals — the most-used one leads on the card, and the tray shows each. */
  reactionCounts?: ReactionCounts | null;
  /**
   * Cast a specific reaction — including 👎, which lives in the tray behind the
   * thumbs-up now that there is no thumbs-down button. Omit for a plain like
   * button with no tray.
   */
  onReact?: (reaction: PostReaction) => void;
  /**
   * Opens the who-reacted-what breakdown from the ⓘ at the end of the tray.
   * Pass only on the viewer's own posts — that list is the author's, and the
   * API returns an empty one to anybody else.
   */
  onShowReactionInfo?: () => void;
  /**
   * The card is on screen. The viewer's own reaction plays as an animated
   * emoji; on a retained card off screen it kept decoding frames and asking
   * for redraws the whole time, which browsers never do for unseen images.
   */
  isVisible?: boolean;
}

const BOUNCE_CONFIG = { damping: 12, stiffness: 300 };

// The tap bounce rides the whole button, icon and count together, the way
// web's ActionBar scales its button. Animated makes whatever it wraps a real
// native view, so a separate Animated.View around the icon was one more view
// per button, seven per card.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const BUTTON_ROW = { flexDirection: "row", alignItems: "center", gap: 4 } as const;

const AnimatedActionButton: React.FC<{
  onPress: () => void;
  onPressIn?: () => void;
  onLongPress?: () => void;
  iconName: React.ComponentProps<typeof Icon>["name"];
  iconNameActive?: React.ComponentProps<typeof Icon>["name"];
  active?: boolean;
  activeColor?: string;
  activeFill?: string;
  activeStrokeWidth?: number;
  inactiveColor?: string;
  iconSize?: number;
  count?: number;
  countColor?: string;
  formatCount?: boolean;
  /** Renders in place of the icon — the reaction whose emoji to show. */
  glyph?: PostReaction;
  /** The glyph is the viewer's own reaction, so it plays its animation. */
  glyphAnimated?: boolean;
  /** Its card is on screen; off screen the animation holds its frame. */
  glyphPlaying?: boolean;
  /** Renders in place of the icon — a custom, self-animating one. */
  iconNode?: React.ReactNode;
  accessibilityLabel?: string;
}> = ({ onPress, onPressIn, onLongPress, iconName, iconNameActive, active, activeColor, activeFill, activeStrokeWidth, inactiveColor, iconSize = 20, count, countColor, formatCount, glyph, glyphAnimated, glyphPlaying = true, iconNode, accessibilityLabel }) => {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => () => scale.stopAnimation(), [scale]);
  // Seven buttons per retained card only animate when tapped. Native-driver
  // transforms avoid registering idle icons in every Reanimated props commit.
  const buttonStyle = useMemo(() => [BUTTON_ROW, { transform: [{ scale }] }], [scale]);

  const handlePress = useCallback(() => {
    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.spring(scale, {
        ...BOUNCE_CONFIG,
        toValue: 1,
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]).start();
    haptic.tap();
    onPress();
  }, [onPress, scale]);

  const resolvedIcon = active && iconNameActive ? iconNameActive : iconName;
  const baseColor = inactiveColor || ICON_ACTIVE;
  const resolvedColor = active ? (activeColor || ICON_ACTIVE) : baseColor;
  const resolvedFill = active && activeFill ? activeFill : undefined;
  // Lucide's own stroke, as on web. It is also what lets Android draw the icon
  // as a font glyph instead of a software-rendered SVG.
  const resolvedStrokeWidth = active && activeStrokeWidth ? activeStrokeWidth : 2;
  // War reads counts as monospace readouts (web war-theme.css).
  const mono = getThemeSkin(getActiveTheme())?.mono ? MONO_TEXT : null;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onLongPress={onLongPress ? () => { haptic.press(); onLongPress(); } : undefined}
      // Matches the web tray's 400ms hold so the gesture feels the same on both.
      delayLongPress={400}
      accessibilityRole="button"
      // The count is folded into the label rather than left as a sibling Text:
      // once a Pressable carries an accessibilityLabel its children stop being
      // announced, so "Comments" alone would lose the number entirely.
      accessibilityLabel={
        accessibilityLabel !== undefined && count !== undefined
          ? `${accessibilityLabel}, ${count}`
          : accessibilityLabel
      }
      // `active` means reacted / reposted / saved depending on the
      // button; all three are on-off states the UI only signals with colour.
      accessibilityState={active === undefined ? undefined : { selected: active }}
      // Vertical slop takes the 18pt icon to a 44pt tap height (HIG minimum)
      // without changing layout. Horizontal stays at 6: the row is
      // justify-between with ~16pt gaps, so wider horizontal slop would make
      // neighbouring buttons' tap areas overlap and steal each other's taps.
      hitSlop={{ top: 13, bottom: 13, left: 6, right: 6 }}
      style={buttonStyle}
    >
      {iconNode ? iconNode : glyph ? (
        // A fixed box, as on web: the emoji is taller than the icon it
        // replaces, and a row that grew when the lead reaction changed moved
        // every post below it.
        <View style={{ width: iconSize, height: iconSize, alignItems: "center", justifyContent: "center" }}>
          <ReactionEmoji
            reaction={glyph}
            animate={glyphAnimated}
            playing={glyphPlaying}
            size={iconSize + 2}
            textStyle={{ fontSize: iconSize - 2, lineHeight: iconSize + 4, width: iconSize, textAlign: "center" }}
          />
        </View>
      ) : (
        <Icon name={resolvedIcon} size={iconSize} color={resolvedColor} strokeWidth={resolvedStrokeWidth} fill={resolvedFill} />
      )}
      {count !== undefined && (
        <Text style={[{ fontSize: 12, color: countColor || COUNT_COLOR }, mono]}>
          {formatCount ? formatCompactNumber(count) : count}
        </Text>
      )}
    </AnimatedPressable>
  );
};

const FeedActionBarComponent: React.FC<FeedActionBarProps> = ({
  liked,
  disliked,
  saved,
  reposted,
  likeCount,
  dislikeCount,
  commentCount,
  repostCount,
  shareCount,
  tipCount,
  onLike,
  onComment,
  onCommentPressIn,
  onShare,
  onTip,
  tokenId,
  viewerAddress,
  onSave,
  onInfo,
  myReaction = null,
  reactionCounts = null,
  onReact,
  onShowReactionInfo,
  isVisible = true,
}) => {
  const { t } = useTranslation();
  // Left-handed mode mirrors the whole row so the thumb lands on the left.
  const { leftHanded } = useAppPrefs();
  // One tray, behind the thumbs-up: every positive face, a divider, then 👎.
  // Closed again whenever the bar is handed another post, so a pick can never
  // go to the wrong one.
  const [trayOpen, setTrayOpen] = useCellState(false, [tokenId]);

  // The tray needs a handler to route to; without one this is a plain like.
  const reactionsEnabled = !!onReact;

  const viewerTipped = useViewerTippedPost(tokenId, viewerAddress);
  // Bumps each time this viewer tips this post, replaying the gem's swirl.
  // Per post: a tip on one post must not leave the gem lit on the next.
  const [tipBurst, setTipBurst] = useCellState(0, [tokenId]);
  useEffect(() => {
    if (tokenId == null) return;
    const id = String(tokenId);
    return subscribePostTipped((tipped) => { if (tipped === id) setTipBurst((n) => n + 1); });
  }, [tokenId, setTipBurst]);

  const handleSelect = useCallback((reaction: PostReaction) => {
    setTrayOpen(false);
    onReact?.(reaction);
  }, [onReact, setTrayOpen]);

  /**
   * The one glyph the thumb wears — the viewer's own reaction (a 👎 too, since
   * this is the only thumb left to show it), else the post's most-used
   * positive one, else undefined for the plain thumbs-up icon. It is also what
   * a tap casts or takes back, so the two can never disagree.
   */
  const leadReaction = resolveLeadReaction(reactionCounts, myReaction);
  const thumbGlyph = resolveThumbReaction(reactionCounts, myReaction) ?? undefined;
  const thumbCount = resolveThumbCount(likeCount, dislikeCount ?? reactionCounts?.dislike ?? 0, thumbGlyph);

  // Single row, every button a direct child spread edge-to-edge (matches the
  // web ActionBar). Order left → right: tip · share · comment · like ·
  // bookmark · info. There is no thumbs-down: 👎 is the last pick in the
  // tray behind the like.
  return (
    <View className={`${leftHanded ? "flex-row-reverse" : "flex-row"} items-center justify-between pt-2`}>
      {onTip ? (
        <AnimatedActionButton
          onPress={onTip}
          accessibilityLabel={t("comments.tip")}
          iconName="Gem"
          iconNode={viewerTipped || tipBurst > 0 ? <TipGemIcon tipped burstKey={tipBurst} size={20} color={ICON_ACTIVE} /> : undefined}
          count={tipCount}
          formatCount
        />
      ) : null}
      {/* Share — carries reposts + link copies; bolder + larger once reposted. */}
      <AnimatedActionButton
        onPress={onShare}
        accessibilityLabel={t("feedCard.shareAndRepost")}
        iconName="Share2"
        active={reposted}
        activeColor={ICON_ACTIVE}
        activeStrokeWidth={2.6}
        iconSize={reposted ? 20 : 18}
        count={shareCount ?? repostCount}
        countColor={reposted ? ICON_ACTIVE : COUNT_COLOR}
        formatCount
      />
      <AnimatedActionButton
        onPress={onComment}
        onPressIn={onCommentPressIn}
        accessibilityLabel={t("postInfo.comments")}
        iconName="MessageSquare"
        count={commentCount}
        formatCount
      />
      {/* Reactions — tap to like/unlike, hold for the tray of every reaction
          (👎 included). The wrapper is the tray's positioning context, and
          stays a single flex item so the row's edge-to-edge spacing is
          unchanged. */}
      <View style={{ position: "relative" }}>
        <ReactionPicker
          open={trayOpen && reactionsEnabled}
          current={myReaction}
          counts={reactionCounts}
          onSelect={handleSelect}
          onClose={() => setTrayOpen(false)}
          align={leftHanded ? "left" : "right"}
          onShowInfo={
            onShowReactionInfo
              ? () => {
                  setTrayOpen(false);
                  onShowReactionInfo();
                }
              : undefined
          }
        />
        <AnimatedActionButton
          onPress={() => {
            if (trayOpen) { setTrayOpen(false); return; }
            // A first plain like is when the viewer has found the button but
            // not the tray behind it — point them at it, once.
            if (!liked && !disliked && reactionsEnabled) maybeShowReactionTip();
            onLike();
          }}
          onLongPress={reactionsEnabled ? () => { markReactionTipSeen(); setTrayOpen(true); } : undefined}
          iconName="ThumbsUp"
          glyph={thumbGlyph}
          glyphAnimated={!!thumbGlyph && thumbGlyph === myReaction}
          glyphPlaying={isVisible}
          active={liked || disliked}
          activeFill={ICON_ACTIVE}
          count={thumbCount}
          formatCount
          accessibilityLabel={
            myReaction
              ? `${reactionMeta(myReaction).label} — hold to change your reaction`
              : `${reactionMeta(leadReaction ?? "like").label} — hold to react`
          }
        />
      </View>
      <AnimatedActionButton
        onPress={onSave}
        accessibilityLabel={t("feedCard.saveToLibrary")}
        iconName="Bookmark"
        active={saved}
        activeColor="#D4D4D8"
        activeFill="#D4D4D8"
        inactiveColor={ICON_MUTED}
      />
      <AnimatedActionButton
        onPress={onInfo}
        accessibilityLabel={t("feedCard.postDetails")}
        iconName="Info"
        inactiveColor={ICON_MUTED}
      />
    </View>
  );
};

const FeedActionBar = memo(FeedActionBarComponent);
export default FeedActionBar;
