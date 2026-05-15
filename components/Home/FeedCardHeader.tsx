import React, { memo } from "react";
import { View, Text, Image, Pressable } from "react-native";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";

const ICON_MUTED = "#6F7174";

export interface FeedCardHeaderProps {
  avatarUrl?: string;
  displayName: string;
  username?: string;
  badgeImage?: any;
  onUserPress?: () => void;
  avatarSize?: number;
  onMenuPress?: () => void;
  onAiPress?: () => void;
  isHidden?: boolean;
}

const FeedCardHeaderComponent: React.FC<FeedCardHeaderProps> = ({
  avatarUrl,
  displayName,
  username,
  badgeImage,
  onUserPress,
  avatarSize = 32,
  onMenuPress,
  onAiPress,
  isHidden,
}) => {
  return (
    <View className="flex-row items-center pb-2">
      <Pressable onPress={onUserPress} style={{ flexShrink: 0 }}>
        <Avatar
          uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
          size={avatarSize}
          rounded={false}
          className="mr-2"
          name={displayName || username}
        />
      </Pressable>

      <View className="flex-1 min-w-0 mr-2">
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            className="text-sm font-semibold"
            style={{ color: "#F9FBFF", flexShrink: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
            onPress={onUserPress}
          >
            {displayName}
          </Text>
          {badgeImage && (
            <Pressable
              onPress={onUserPress}
              style={{ marginLeft: 4 }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Image source={badgeImage} style={{ width: 10, height: 10 }} resizeMode="contain" />
            </Pressable>
          )}
        </View>
        {username ? (
          <Text
            className="text-[11px] mt-0.5"
            style={{ color: "#A6A9AC" }}
            numberOfLines={1}
            ellipsizeMode="tail"
            onPress={onUserPress}
          >
            @{username}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-1">
        {isHidden && <Icon name="EyeOff" size={14} color={ICON_MUTED} />}
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
