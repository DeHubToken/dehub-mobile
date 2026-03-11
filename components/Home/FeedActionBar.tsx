import React, { memo, useCallback, useRef } from "react";
import { View, Pressable } from "react-native";
import { Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import RepostPopover from "../common/RepostPopover";
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
  onRepost: () => void;
  onTip: () => void;
  onSave: () => void;
  onInfo: () => void;
  showRepostPopover: boolean;
  onCloseRepostPopover: () => void;
  onConfirmRepost: () => void;
  onUndoRepost: () => void;
  onQuote: () => void;
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
  count?: number;
  countColor?: string;
  formatCount?: boolean;
}> = ({ onPress, iconName, iconNameActive, active, activeColor, activeFill, activeStrokeWidth, inactiveColor, count, countColor, formatCount }) => {
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
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Animated.View style={animatedStyle}>
        <Icon name={resolvedIcon} size={18} color={resolvedColor} strokeWidth={resolvedStrokeWidth} fill={resolvedFill} />
      </Animated.View>
      {count !== undefined && (
        <Text style={{ fontSize: 11, color: countColor || COUNT_COLOR }}>
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
  onRepost,
  onTip,
  onSave,
  onInfo,
  showRepostPopover,
  onCloseRepostPopover,
  onConfirmRepost,
  onUndoRepost,
  onQuote,
}) => {
  const repostAnchorRef = useRef<View>(null);

  return (
    <View className="flex-row items-center justify-between pt-2">
      <View className="flex-row items-center gap-4">
        <AnimatedActionButton
          onPress={onLike}
          iconName="ThumbsUp"
          active={liked}
          activeFill={ICON_ACTIVE}
          count={likeCount}
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
        <AnimatedActionButton
          onPress={onComment}
          iconName="MessageSquare"
          count={commentCount}
          formatCount
        />
        <View ref={repostAnchorRef} style={{ position: "relative", zIndex: 50 }}>
          <AnimatedActionButton
            onPress={onRepost}
            iconName="Repeat2"
            active={reposted}
            activeColor={ICON_ACTIVE}
            activeStrokeWidth={2.8}
            count={repostCount}
            countColor={reposted ? ICON_ACTIVE : COUNT_COLOR}
            formatCount
          />
          <RepostPopover
            visible={showRepostPopover}
            onClose={onCloseRepostPopover}
            onRepost={reposted ? onUndoRepost : onConfirmRepost}
            onQuote={onQuote}
            isReposted={reposted}
            anchorRef={repostAnchorRef}
          />
        </View>
        <AnimatedActionButton
          onPress={onTip}
          iconName="Gem"
          count={tipCount}
          formatCount
        />
      </View>
      <View className="flex-row items-center gap-4">
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
    </View>
  );
};

const FeedActionBar = memo(FeedActionBarComponent);
export default FeedActionBar;
