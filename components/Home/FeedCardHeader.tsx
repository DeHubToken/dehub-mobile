import React, { memo } from "react";
import { View, Text, Pressable } from "react-native";
import SmartImage from "../common/SmartImage";
import Avatar from "../common/Avatar";
import NewMemberChip from "../common/NewMemberChip";
import Icon from "../ui/Icon";
import DeferredBlock from "../common/DeferredBlock";
import { getBadgeOpticalStyle } from "../../libs/misc";
import { useTranslation } from "react-i18next";

const ICON_MUTED = "#6F7174";
// Matches the web card's 23.5px header icons. The cluster is pulled up and
// out by the same 4pt its buttons pad with, so the icons' top and right edges
// land exactly on the card's 12pt inset — equal top and side, and hanging free
// at the bottom rather than centred against a two-line identity block.
const HEADER_ICON_SIZE = 22;
const HEADER_ICON_PAD = 4;
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
  const { t } = useTranslation();
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

      {/* One pressable for the whole identity block (name, badge, handle)
          instead of three nested ones: same tap targets, the same hit slop,
          three native views fewer per card. It is content-width and shrinks
          so the name still truncates; the icon group below pushes itself to
          the right edge with marginLeft: auto. */}
      <Pressable
        onPress={onUserPress}
        hitSlop={IDENTITY_HIT_SLOP}
        style={{ flexShrink: 1, minWidth: 0, marginRight: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT }}>
          <Text
            className="font-semibold"
            style={{ flexShrink: 1, minWidth: 0, color: "#F9FBFF", fontSize: DISPLAY_NAME_FONT_SIZE, lineHeight: DISPLAY_NAME_LINE_HEIGHT }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
          {badgeImage && (
            <View
              style={{
                flexShrink: 0,
                height: DISPLAY_NAME_LINE_HEIGHT,
                marginLeft: HOLDER_BADGE_GAP,
                justifyContent: "center",
              }}
            >
              <SmartImage
                source={badgeImage}
                style={[
                  getBadgeOpticalStyle(badgeImage, HOLDER_BADGE_SIZE, 0, DISPLAY_NAME_LINE_HEIGHT),
                  { marginLeft: 0 },
                ]}
                contentFit="contain"
              />
            </View>
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
          <Text
            className="mt-0.5"
            style={{ alignSelf: "flex-start", maxWidth: "100%", color: "#A6A9AC", fontSize: 14, lineHeight: 18 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            @{username}
          </Text>
        ) : null}
      </Pressable>

      {/* Mid-fling this is an empty box of the measured size for the same
          set of buttons; the pressables mount on settle (DeferredBlock). */}
      <DeferredBlock
        cacheKey={`feed-header-icons:${isHidden ? 1 : 0}${onBoostPress ? 1 : 0}${onAiPress ? 1 : 0}${onMenuPress ? 1 : 0}`}
        reserveWidth
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          alignSelf: "flex-start",
          marginLeft: "auto",
          marginTop: -HEADER_ICON_PAD,
          marginRight: -HEADER_ICON_PAD,
        }}
      >
        {isHidden && <Icon name="EyeOff" size={16} color={ICON_MUTED} />}
        {onBoostPress && (
          <Pressable
            onPress={onBoostPress}
            accessibilityRole="button"
            accessibilityLabel={t("feedCard.boostPost")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: HEADER_ICON_PAD, marginRight: 1.6 }}
          >
            <Icon name="Rocket" size={HEADER_ICON_SIZE} color={ICON_MUTED} />
          </Pressable>
        )}
        {onAiPress && (
          <Pressable
            onPress={onAiPress}
            accessibilityRole="button"
            accessibilityLabel={t("nav.assistant")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: HEADER_ICON_PAD }}
          >
            <Icon name="Sparkles" size={HEADER_ICON_SIZE} color={ICON_MUTED} />
          </Pressable>
        )}
        {onMenuPress && (
          <Pressable
            onPress={onMenuPress}
            accessibilityRole="button"
            accessibilityLabel={t("player.moreOptions")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: HEADER_ICON_PAD }}
          >
            <Icon name="EllipsisVertical" size={HEADER_ICON_SIZE} color={ICON_MUTED} />
          </Pressable>
        )}
      </DeferredBlock>
    </View>
  );
};

export const FeedCardHeader = memo(FeedCardHeaderComponent);
export default FeedCardHeader;
