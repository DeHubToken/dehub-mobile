import React, { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "../ui/Icon";
import ReactionPicker from "./ReactionPicker";
import { ReactionEmoji } from "./ReactionEmoji";
import { TipGemIcon } from "./TipGemIcon";
import { formatCompactNumber } from "../../libs/numbers.util";
import {
  reactionMeta,
  resolveLeadReaction,
  resolveThumbReaction,
  resolveThumbCount,
  type PostReaction,
  type ReactionCounts,
} from "../../libs/reactions";
import { haptic } from "../../libs/haptics";
import { maybeShowReactionTip, markReactionTipSeen } from "../../libs/reaction-tip";
import { subscribePostTipped } from "../../libs/tip-events";
import { useViewerTippedPost } from "../../hooks/useViewerTippedPost";
import { useAppTheme } from "../../context/ThemeContext";
import { MONO_TEXT } from "../../theme/skins";

const ICON = "#F4F4F5";
const LABEL = "#D4D4D8";
// Neutral fills on purpose: under a canvas theme the control pass
// (libs/jsx/controls.js) dresses neutral pressables in that theme's own
// control material, so these tiles pick up War's frame, Osaka's pink edge and
// so on without a per-theme table here.
const TILE_FILL = "rgba(255,255,255,0.06)";
const TILE_FILL_ON = "rgba(255,255,255,0.14)";
const TILE_LINE = "rgba(255,255,255,0.10)";

export interface PostStageActionBarProps {
  liked: boolean;
  disliked: boolean;
  saved: boolean;
  reposted: boolean;
  likeCount: number;
  dislikeCount?: number;
  commentCount: number;
  /** Reposts + quotes. */
  repostCount: number;
  onLike: () => void;
  onReact?: (reaction: PostReaction) => void;
  myReaction?: PostReaction | null;
  reactionCounts?: ReactionCounts | null;
  onShowReactionInfo?: () => void;
  /** Scrolls to the comments and focuses the composer. */
  onComment: () => void;
  /** Opens the repost + share sheet. */
  onRepost: () => void;
  /** Omitted where tips are not offered: the bar then has four tiles. */
  onTip?: () => void;
  onSave: () => void;
  tokenId?: number | string | null;
  viewerAddress?: string | null;
  isVisible?: boolean;
}

type TileProps = {
  label: string;
  a11y: string;
  on?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  radius: number;
  mono: boolean;
};

function Tile({ label, a11y, on, onPress, onLongPress, children, radius, mono }: TileProps) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      onLongPress={onLongPress ? () => { haptic.press(); onLongPress(); } : undefined}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      style={({ pressed }) => [
        styles.tile,
        { borderRadius: radius, backgroundColor: on ? TILE_FILL_ON : TILE_FILL, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View style={styles.iconBox}>{children}</View>
      <Text numberOfLines={1} style={[styles.label, mono && MONO_TEXT]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The post page's one big action bar: like (hold for every reaction, 👎
 * last), comments, repost + share, tip and save, as equal tiles with the icon
 * over its count or label. Share, the thumbs-down and post info have no tile
 * of their own: share sits in the repost sheet, 👎 in the like tray, info in ⋯.
 */
function PostStageActionBarComponent({
  liked,
  disliked,
  saved,
  reposted,
  likeCount,
  dislikeCount,
  commentCount,
  repostCount,
  onLike,
  onReact,
  myReaction = null,
  reactionCounts = null,
  onShowReactionInfo,
  onComment,
  onRepost,
  onTip,
  onSave,
  tokenId,
  viewerAddress,
  isVisible = true,
}: PostStageActionBarProps) {
  const { t } = useTranslation();
  const { skin } = useAppTheme();
  const radius = skin?.square ? 0 : 12;
  const mono = !!skin?.mono;
  const [trayOpen, setTrayOpen] = useState(false);
  useEffect(() => setTrayOpen(false), [tokenId]);
  const reactionsEnabled = !!onReact;

  const viewerTipped = useViewerTippedPost(tokenId, viewerAddress);
  const [tipBurst, setTipBurst] = useState(0);
  useEffect(() => {
    if (tokenId == null) return;
    const id = String(tokenId);
    return subscribePostTipped((tipped) => { if (tipped === id) setTipBurst((n) => n + 1); });
  }, [tokenId]);

  const handleSelect = useCallback((reaction: PostReaction) => {
    setTrayOpen(false);
    onReact?.(reaction);
  }, [onReact]);

  const leadReaction = resolveLeadReaction(reactionCounts, myReaction);
  const thumbGlyph = resolveThumbReaction(reactionCounts, myReaction) ?? undefined;
  const thumbCount = resolveThumbCount(likeCount, dislikeCount ?? reactionCounts?.dislike ?? 0, thumbGlyph);
  const likeA11y = myReaction
    ? `${reactionMeta(myReaction).label} — hold to change your reaction`
    : `${reactionMeta(leadReaction ?? "like").label} — hold to react`;

  return (
    <View style={styles.row} testID="post-stage-bar">
      <View style={styles.cell}>
        <ReactionPicker
          open={trayOpen && reactionsEnabled}
          current={myReaction}
          counts={reactionCounts}
          onSelect={handleSelect}
          onClose={() => setTrayOpen(false)}
          onShowInfo={
            onShowReactionInfo
              ? () => {
                  setTrayOpen(false);
                  onShowReactionInfo();
                }
              : undefined
          }
        />
        <Tile
          label={formatCompactNumber(thumbCount)}
          a11y={`${likeA11y}, ${thumbCount}`}
          on={liked || disliked}
          radius={radius}
          mono={mono}
          onPress={() => {
            if (trayOpen) { setTrayOpen(false); return; }
            if (!liked && !disliked && reactionsEnabled) maybeShowReactionTip();
            onLike();
          }}
          onLongPress={reactionsEnabled ? () => { markReactionTipSeen(); setTrayOpen(true); } : undefined}
        >
          {thumbGlyph ? (
            <ReactionEmoji
              reaction={thumbGlyph}
              animate={thumbGlyph === myReaction}
              playing={isVisible}
              size={22}
              textStyle={{ fontSize: 18, lineHeight: 24, width: 20, textAlign: "center" }}
            />
          ) : (
            <Icon name="ThumbsUp" size={20} color={ICON} fill={liked ? ICON : undefined} />
          )}
        </Tile>
      </View>
      <View style={styles.cell}>
        <Tile
          label={formatCompactNumber(commentCount)}
          a11y={`${t("postInfo.comments")}, ${commentCount}`}
          radius={radius}
          mono={mono}
          onPress={onComment}
        >
          <Icon name="MessageSquare" size={20} color={ICON} />
        </Tile>
      </View>
      <View style={styles.cell}>
        <Tile
          label={formatCompactNumber(repostCount)}
          a11y={`${t("feedCard.shareAndRepost")}, ${repostCount}`}
          on={reposted}
          radius={radius}
          mono={mono}
          onPress={onRepost}
        >
          <Icon name="Repeat2" size={21} color={ICON} strokeWidth={reposted ? 2.6 : 2} />
        </Tile>
      </View>
      {onTip ? (
        <View style={styles.cell}>
          <Tile label={t("comments.tip")} a11y={t("comments.tip")} radius={radius} mono={mono} onPress={onTip}>
            {viewerTipped || tipBurst > 0 ? (
              <TipGemIcon tipped burstKey={tipBurst} size={20} color={ICON} />
            ) : (
              <Icon name="Gem" size={20} color={ICON} />
            )}
          </Tile>
        </View>
      ) : null}
      <View style={styles.cell}>
        <Tile
          label={t("common.save")}
          a11y={t("feedCard.saveToLibrary")}
          on={saved}
          radius={radius}
          mono={mono}
          onPress={onSave}
        >
          <Icon name="Bookmark" size={20} color={ICON} fill={saved ? ICON : undefined} />
        </Tile>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingTop: 12 },
  cell: { flex: 1, position: "relative" },
  tile: {
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderColor: TILE_LINE,
  },
  iconBox: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, fontWeight: "700", color: LABEL },
});

const PostStageActionBar = memo(PostStageActionBarComponent);
export default PostStageActionBar;
