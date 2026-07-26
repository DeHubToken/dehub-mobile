import React, { memo, useCallback } from "react";
import { View, Pressable, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import { formatCompactNumber } from "../../libs/numbers.util";

const ICON_MUTED = "#6F7174";
const ICON_ACTIVE = "#F9FBFF";
const COUNT_COLOR = "#8B8D90";

interface FeedActionBarProps {
  liked: boolean;
  disliked: boolean;
  saved: boolean;
  reposted: boolean;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  repostCount: number;
  tipCount: number;
  onLike: () => void;
  onDislike: () => void;
  onComment: () => void;
  /** Opens the Share sheet (repost / quote / copy-link / send-in-DM / share-as-image). */
  onShare: () => void;
  onTip: () => void;
  onSave: () => void;
  onInfo: () => void;
}

const BOUNCE_CONFIG = { damping: 12, stiffness: 300 };

const AnimatedActionButton: React.FC<{
  onPress: () => void;
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
}> = ({ onPress, iconName, iconNameActive, active, activeColor, activeFill, activeStrokeWidth, inactiveColor, iconSize = 20, count, countColor, formatCount }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(
      withTiming(1.3, { duration: 100 }),
      withSpring(1, BOUNCE_CONFIG),
    );
    onPress();
  }, [onPress, scale]);

  const resolvedIcon = active && iconNameActive ? iconNameActive : iconName;
  const baseColor = inactiveColor || ICON_ACTIVE;
  const resolvedColor = active ? (activeColor || ICON_ACTIVE) : baseColor;
  const resolvedFill = active && activeFill ? activeFill : undefined;
  const resolvedStrokeWidth = active && activeStrokeWidth ? activeStrokeWidth : 1.8;

  return (
    <Pressable
      onPress={handlePress}
      // Vertical slop takes the 18pt icon to a 44pt tap height (HIG minimum)
      // without changing layout. Horizontal stays at 6: the row is
      // justify-between with ~16pt gaps, so wider horizontal slop would make
      // neighbouring buttons' tap areas overlap and steal each other's taps.
      hitSlop={{ top: 13, bottom: 13, left: 6, right: 6 }}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Animated.View style={animatedStyle}>
        <Icon name={resolvedIcon} size={iconSize} color={resolvedColor} strokeWidth={resolvedStrokeWidth} fill={resolvedFill} />
      </Animated.View>
      {count !== undefined && (
        <Text style={{ fontSize: 12, color: countColor || COUNT_COLOR }}>
          {formatCount ? formatCompactNumber(count) : count}
        </Text>
      )}
    </Pressable>
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
  tipCount,
  onLike,
  onDislike,
  onComment,
  onShare,
  onTip,
  onSave,
  onInfo,
}) => {
  // Single row, every button a direct child spread edge-to-edge (matches the
  // web ActionBar). Order left → right: tip · dislike · share · comment · like
  // · bookmark · info.
  return (
    <View className="flex-row items-center justify-between pt-2">
      <AnimatedActionButton
        onPress={onTip}
        iconName="Gem"
        count={tipCount}
        formatCount
      />
      <AnimatedActionButton
        onPress={onDislike}
        iconName="ThumbsDown"
        active={disliked}
        activeFill={ICON_ACTIVE}
        count={dislikeCount}
        formatCount
      />
      {/* Share — carries the repost count; bolder + larger once reposted. */}
      <AnimatedActionButton
        onPress={onShare}
        iconName="Share2"
        active={reposted}
        activeColor={ICON_ACTIVE}
        activeStrokeWidth={2.6}
        iconSize={reposted ? 20 : 18}
        count={repostCount}
        countColor={reposted ? ICON_ACTIVE : COUNT_COLOR}
        formatCount
      />
      <AnimatedActionButton
        onPress={onComment}
        iconName="MessageSquare"
        count={commentCount}
        formatCount
      />
      <AnimatedActionButton
        onPress={onLike}
        iconName="ThumbsUp"
        active={liked}
        activeFill={ICON_ACTIVE}
        count={likeCount}
        formatCount
      />
      <AnimatedActionButton
        onPress={onSave}
        iconName="Bookmark"
        active={saved}
        activeColor="#FACC15"
        activeFill="#FACC15"
        inactiveColor={ICON_MUTED}
      />
      <AnimatedActionButton
        onPress={onInfo}
        iconName="Info"
        inactiveColor={ICON_MUTED}
      />
    </View>
  );
};

const FeedActionBar = memo(FeedActionBarComponent);
export default FeedActionBar;
