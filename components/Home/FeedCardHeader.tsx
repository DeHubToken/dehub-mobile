import BadgeArtwork from "../common/BadgeArtwork";
import React, { memo, useRef } from "react";
import { View, Text, Pressable } from "react-native";
import Avatar from "../common/Avatar";
import NewMemberChip from "../common/NewMemberChip";
import Icon from "../ui/Icon";
import { getBadgeHoverOpticalStyle as getBadgeOpticalStyle } from "../../libs/misc";
import { openBadgeShowcase, tierForBadgeImage } from "../../libs/badgeShowcase";
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
const HOLDER_BADGE_GAP = 0;
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
  const badgeRef = useRef<View>(null);
  return (
    <View className="flex-row items-end pb-2" style={{ minHeight: Math.max(avatarSize, username ? 40 : 20) + 8 }}>
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
          three native views fewer per card. It fills the space left by the
          avatar and controls, so names truncate only at the available edge. */}
      <Pressable
        onPress={onUserPress}
        hitSlop={IDENTITY_HIT_SLOP}
        style={{ flex: 1, minWidth: 0, marginRight: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT }}>
          <Text
            className="font-semibold"
            style={{ flexShrink: 1, minWidth: 0, color: "#F9FBFF", fontSize: DISPLAY_NAME_FONT_SIZE, lineHeight: DISPLAY_NAME_LINE_HEIGHT, includeFontPadding: false }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
          {badgeImage && (
            <Pressable
              ref={badgeRef}
              onPress={() => openBadgeShowcase(tierForBadgeImage(badgeImage), badgeRef.current)}
              hitSlop={6}
              style={{
                flexShrink: 0,
                height: DISPLAY_NAME_LINE_HEIGHT,
                marginLeft: HOLDER_BADGE_GAP,
                justifyContent: "center",
              }}
            >
              {/* The still bitmap is shared; motion mounts only while this badge is active. */}
              <BadgeArtwork
                source={badgeImage}
                style={[
                  getBadgeOpticalStyle(badgeImage, HOLDER_BADGE_SIZE, 0, DISPLAY_NAME_LINE_HEIGHT),
                ]}
                resizeMode="contain"
                fadeDuration={0}
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
                // An offset rather than a transform: a layout-only wrapper is
                // flattened away, and for everyone who is not new the chip
                // renders nothing, so this cost every card a native view.
                top: -1,
              }}
            >
              <NewMemberChip address={address} />
            </View>
          )}
        </View>
        {username ? (
          <Text
            style={{ alignSelf: "flex-start", maxWidth: "100%", color: "#A6A9AC", fontSize: 14, lineHeight: 16, includeFontPadding: false }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            @{username}
          </Text>
        ) : null}
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          flexShrink: 0,
          alignItems: "center",
          gap: 8,
          alignSelf: "flex-end",
          marginBottom: -HEADER_ICON_PAD,
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
      </View>
    </View>
  );
};

export const FeedCardHeader = memo(FeedCardHeaderComponent);
export default FeedCardHeader;
