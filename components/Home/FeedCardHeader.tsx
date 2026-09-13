import React, { memo } from "react";
import { View, Text, Image, Pressable } from "react-native";
import Avatar from "../common/Avatar";
import NewMemberChip from "../common/NewMemberChip";
import Icon from "../ui/Icon";
import { getBadgeOpticalStyle } from "../../libs/misc";

const ICON_MUTED = "#6F7174";
const DISPLAY_NAME_FONT_SIZE = 16;
const DISPLAY_NAME_LINE_HEIGHT = 20;
const HOLDER_BADGE_SIZE = 16;
const HOLDER_BADGE_GAP = 2;
// A bare Text onPress is the least forgiving target on Android: a thin line of
// 14pt type with no slop, cancelled by a few pixels of finger travel. Name,
// handle and avatar are real Pressables with room around them.
const IDENTITY_HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 8 };

export interface FeedCardHeaderProps {
  avatarUrl?: string;
  displayName: string;
  username?: string;
  address?: string;
  badgeImage?: any;
  onUserPress?: () => void;
  avatarSize?: number;
  onMenuPress?: () => void;
  onAiPress?: () => void;
  onBoostPress?: () => void;
  isHidden?: boolean;
}

const FeedCardHeaderComponent: React.FC<FeedCardHeaderProps> = ({
  avatarUrl,
  displayName,
  username,
  address,
  badgeImage,
  onUserPress,
  avatarSize = 32,
  onMenuPress,
  onAiPress,
  onBoostPress,
  isHidden,
}) => {
  return (
    <View className="flex-row items-center pb-2">
      <Pressable onPress={onUserPress} style={{ flexShrink: 0 }} hitSlop={IDENTITY_HIT_SLOP}>
        <Avatar
          uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
          size={avatarSize}
          className="mr-2"
          name={displayName || username}
        />
      </Pressable>

      <View className="flex-1 min-w-0 mr-2">
        <View style={{ flexDirection: "row", alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT }}>
          <Pressable onPress={onUserPress} style={{ flexShrink: 1, minWidth: 0 }} hitSlop={IDENTITY_HIT_SLOP}>
            <Text
              className="font-semibold"
              style={{ color: "#F9FBFF", fontSize: DISPLAY_NAME_FONT_SIZE, lineHeight: DISPLAY_NAME_LINE_HEIGHT }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName}
            </Text>
          </Pressable>
          {badgeImage && (
            <Pressable
              onPress={onUserPress}
              style={{
                flexShrink: 0,
                height: DISPLAY_NAME_LINE_HEIGHT,
                marginLeft: HOLDER_BADGE_GAP,
                justifyContent: "center",
              }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Image
                source={badgeImage}
                style={[
                  getBadgeOpticalStyle(badgeImage, HOLDER_BADGE_SIZE, 0, DISPLAY_NAME_LINE_HEIGHT),
                  { marginLeft: 0 },
                ]}
                resizeMode="contain"
              />
            </Pressable>
          )}
          {address && (
            <View
              style={{
                flexShrink: 0,
                height: DISPLAY_NAME_LINE_HEIGHT,
                marginLeft: 4,
                justifyContent: "center",
                transform: [{ translateY: -1 }],
              }}
            >
              <NewMemberChip address={address} />
            </View>
          )}
        </View>
        {username ? (
          <Pressable onPress={onUserPress} style={{ alignSelf: "flex-start", maxWidth: "100%" }} hitSlop={IDENTITY_HIT_SLOP}>
            <Text
              className="mt-0.5"
              style={{ color: "#A6A9AC", fontSize: 14, lineHeight: 18 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              @{username}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row items-center gap-1">
        {isHidden && <Icon name="EyeOff" size={14} color={ICON_MUTED} />}
        {onBoostPress && (
          <Pressable
            onPress={onBoostPress}
            accessibilityRole="button"
            accessibilityLabel="Boost post"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 4, marginRight: 1.6 }}
          >
            <Icon name="Rocket" size={16} color={ICON_MUTED} />
          </Pressable>
        )}
        {onAiPress && (
          <Pressable
            onPress={onAiPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 4 }}
          >
            <Icon name="Sparkles" size={16} color={ICON_MUTED} />
          </Pressable>
        )}
        {onMenuPress && (
          <Pressable
            onPress={onMenuPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: 4 }}
          >
            <Icon name="EllipsisVertical" size={16} color={ICON_MUTED} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

export const FeedCardHeader = memo(FeedCardHeaderComponent);
export default FeedCardHeader;
