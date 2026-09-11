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
  isHidden,
}) => {
  return (
    <View className="flex-row items-center pb-2">
      <Pressable onPress={onUserPress} style={{ flexShrink: 0 }}>
        <Avatar
          uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
          size={avatarSize}
          className="mr-2"
          name={displayName || username}
        />
      </Pressable>

      <View className="flex-1 min-w-0 mr-2">
        <View style={{ flexDirection: "row", alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT }}>
          <Text
            className="font-semibold"
            style={{ color: "#F9FBFF", flexShrink: 1, fontSize: DISPLAY_NAME_FONT_SIZE, lineHeight: DISPLAY_NAME_LINE_HEIGHT }}
            numberOfLines={1}
            ellipsizeMode="tail"
            onPress={onUserPress}
          >
            {displayName}
          </Text>
          {badgeImage && (
            <Pressable
              onPress={onUserPress}
              style={{ flexShrink: 0, height: DISPLAY_NAME_LINE_HEIGHT, marginLeft: 4, justifyContent: "center" }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Image
                source={badgeImage}
                style={[
                  getBadgeOpticalStyle(badgeImage, HOLDER_BADGE_SIZE, -1, DISPLAY_NAME_LINE_HEIGHT),
                  { marginLeft: 0 },
                ]}
                resizeMode="contain"
              />
            </Pressable>
          )}
          {address && (
            <View style={{ flexShrink: 0, height: DISPLAY_NAME_LINE_HEIGHT, marginLeft: 4, justifyContent: "center" }}>
              <NewMemberChip address={address} />
            </View>
          )}
        </View>
        {username ? (
          <Text
            className="mt-0.5"
            style={{ color: "#A6A9AC", fontSize: 14, lineHeight: 18 }}
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
