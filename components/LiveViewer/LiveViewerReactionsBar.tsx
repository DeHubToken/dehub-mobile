/**
 * The live viewer's action row.
 *
 * Bare icons over the bottom scrim, on 44pt cells — the same row the shorts
 * viewer draws (ShortsViewerScreen's actionBar) and the same one the feed card
 * draws under a post. It used to be a strip of black/40 circles with hairline
 * borders and a red like pill, which is a control style that exists nowhere
 * else in the app.
 */
import React, { memo, useCallback, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Icon from "../ui/Icon";
import type { ReactionType } from "../LiveProducer/ReactionOverlay";
import { formatCompactNumber } from "../../libs/numbers.util";
import { COUNT_COLOR, EDGE, ICON_COLOR, TEXT_SHADOW } from "../common/ViewerChrome";

const REACTION_OPTIONS: { type: ReactionType; emoji: string }[] = [
  { type: "HEART", emoji: "❤️" },
  { type: "LIKE", emoji: "👍" },
  { type: "CELEBRATE", emoji: "🎉" },
  { type: "LAUGH", emoji: "😂" },
  { type: "SUPPORT", emoji: "✊" },
];

interface LiveViewerReactionsBarProps {
  onReact: (type: ReactionType) => void;
  onLike: () => void;
  onShare: () => void;
  disabled: boolean;
  likeCount: number;
  isLiked: boolean;
  likePending: boolean;
  isLive: boolean;
}

const COOLDOWN_MS = 400;

const LiveViewerReactionsBar: React.FC<LiveViewerReactionsBarProps> = ({
  onReact,
  onLike,
  onShare,
  disabled,
  likeCount,
  isLiked,
  likePending,
  isLive,
}) => {
  const lastTapRef = useRef(0);

  const handleReact = useCallback(
    (type: ReactionType) => {
      const now = Date.now();
      if (now - lastTapRef.current < COOLDOWN_MS) return;
      lastTapRef.current = now;
      onReact(type);
    },
    [onReact]
  );

  return (
    <View style={styles.bar}>
      {isLive &&
        REACTION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.type}
            onPress={() => handleReact(opt.type)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={"React " + opt.type.toLowerCase()}
            style={[styles.cell, disabled ? styles.disabled : null]}
          >
            <Text style={styles.glyph}>{opt.emoji}</Text>
          </Pressable>
        ))}

      <Pressable
        onPress={onLike}
        disabled={likePending || !isLive}
        accessibilityRole="button"
        accessibilityLabel={isLiked ? "Unlike" : "Like"}
        style={[styles.cell, likePending ? styles.disabled : null]}
      >
        {/* Filled white when liked, as the shorts action row does — the design
            system reserves hue for nothing on these surfaces. */}
        <Icon
          name="Heart"
          size={20}
          color={ICON_COLOR}
          strokeWidth={1.8}
          fill={isLiked ? ICON_COLOR : "none"}
        />
        {likeCount > 0 && (
          <Text style={styles.count} numberOfLines={1}>
            {formatCompactNumber(likeCount)}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="Share"
        style={styles.cell}
      >
        <Icon name="Share2" size={20} color={ICON_COLOR} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: EDGE,
    paddingTop: 4,
  },
  /**
   * Equal share of the row, with the 44pt floor the shorts bar uses: these are
   * the most-thumbed controls on the screen, and the old 36pt circles were
   * under both the iOS 44 and the Android 48 minimum.
   */
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
  },
  disabled: {
    opacity: 0.35,
  },
  glyph: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  count: {
    color: COUNT_COLOR,
    fontSize: 12,
    fontWeight: "500",
    ...TEXT_SHADOW,
  },
});

export default memo(LiveViewerReactionsBar);
