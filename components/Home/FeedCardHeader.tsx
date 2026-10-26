import BadgeArtwork from "../common/BadgeArtwork";
import React, { memo, useCallback, useEffect, useRef } from "react";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { useAppTheme } from "../../context/ThemeContext";
import { View, Text, Pressable } from "react-native";
import Avatar from "../common/Avatar";
import NewMemberChip from "../common/NewMemberChip";
import Icon from "../ui/Icon";
import { getBadgeHoverOpticalStyle as getBadgeOpticalStyle } from "../../libs/misc";
import { openBadgeShowcase, tierForBadgeImage } from "../../libs/badgeShowcase";
import { useTranslation } from "react-i18next";
import { useLiveTarget } from "../../hooks/useIsUserLive";
import { openLiveTarget } from "../../libs/openLiveTarget";
import { prefetchUserProfile } from "../../hooks/useUserProfileData";

const ICON_MUTED = "#6F7174";
// Cancel the buttons' padding so their artwork starts at the card's inset.
const HEADER_ICON_SIZE = 20;
const HEADER_ICON_PAD = 4;
// How far the visible dots sit inside the card's content, from the top and
// from the side alike: 18px from the bento's edge, matching web.
const CORNER_INSET = 6;
// The cut vertical dots fill x 14-18, y 4-28 of a 32-unit grid. Shift them by
// that spare room, less the inset, so the corner reads evenly padded.
const MENU_ICON_END_SPACE = HEADER_ICON_SIZE * (14 / 32) - CORNER_INSET;
const CORNER_ICON_DROP = CORNER_INSET - HEADER_ICON_SIZE * (4 / 32);
// Boost keeps 14px between its glyph box and the dots' (row gap 8, two pads).
const BOOST_END_SPACE = 14 - 8 - 2 * HEADER_ICON_PAD - MENU_ICON_END_SPACE;
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
  onBoostPress?: () => void;
  /** The post is in a paid boost slot: the bolt shows for everyone, solid and glowing. */
  boosted?: boolean;
  /** Where the lit bolt goes for a viewer who cannot boost this post. */
  onBoostedPress?: () => void;
  isHidden?: boolean;
}

// Written as hsla() so the readability and System Light colour passes leave
// the lit bolt at full white / near-black.
const LIT_DARK = "hsla(0,0%,100%,1)";
const LIT_LIGHT = "hsla(240,6%,10%,1)";

// The cut bolt's own outline (cut-icons SuperPowers), filled for the lit state.
const BOLT_PATH = "M18 3L5 18H14L12 29L27 13H18Z";
const GLOW_SIZE = HEADER_ICON_SIZE + 16;

/** The lit bolt: the same cut bolt, solid, over a soft radial glow that breathes. */
function LitBolt({ color, glow }: { color: string; glow: string }) {
  const breath = useSharedValue(1);
  useEffect(() => {
    breath.value = withRepeat(withTiming(0.35, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [breath]);
  const style = useAnimatedStyle(() => ({ opacity: breath.value }));
  return (
    <View style={{ width: HEADER_ICON_SIZE, height: HEADER_ICON_SIZE }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", left: -8, top: -8, width: GLOW_SIZE, height: GLOW_SIZE }, style]}
      >
        <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
          <Defs>
            <RadialGradient id="boostGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glow} stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={glow} stopOpacity={0.18} />
              <Stop offset="1" stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#boostGlow)" />
        </Svg>
      </Animated.View>
      <Svg width={HEADER_ICON_SIZE} height={HEADER_ICON_SIZE} viewBox="0 0 32 32">
        <Path d={BOLT_PATH} fill={color} stroke={color} strokeWidth={2.4} strokeLinejoin="round" />
      </Svg>
    </View>
  );
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
  onBoostPress,
  boosted,
  onBoostedPress,
  isHidden,
}) => {
  const { t } = useTranslation();
  const { isLight } = useAppTheme();
  const litColor = isLight ? LIT_LIGHT : LIT_DARK;
  const boltPress = onBoostPress ?? (boosted ? onBoostedPress : undefined);
  const badgeRef = useRef<View>(null);
  // While they are live the avatar opens the stream; name and @handle
  // still open the profile.
  const liveTarget = useLiveTarget(address, username);
  const live = !!liveTarget;
  // Start fetching the profile as the finger lands, so it is usually in hand
  // by the time the tap is released and the page slides in.
  const warmProfile = useCallback(() => prefetchUserProfile(username || address), [username, address]);
  return (
    <View className="flex-row items-start pb-2" style={{ minHeight: Math.max(avatarSize, username ? 36 : 20) + 8 }}>
      <Pressable
        onPress={liveTarget ? () => openLiveTarget(liveTarget) : onUserPress}
        onPressIn={liveTarget || !onUserPress ? undefined : warmProfile}
        style={{ flexShrink: 0 }}
        hitSlop={IDENTITY_HIT_SLOP}
      >
        <Avatar
          uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
          size={avatarSize}
          className="mr-2"
          name={displayName || username}
          live={live}
        />
      </Pressable>

      {/* Only the name row and the @handle open the profile, each sized to
          its text. The column around them is a plain View, so a tap in the
          blank space beside the name falls through to the card and opens
          the post. The column still fills the space left by the avatar and
          controls, so names truncate only at the available edge. */}
      <View style={{ flex: 1, minWidth: 0, marginRight: 8, alignItems: "flex-start" }}>
        <Pressable
          onPress={onUserPress}
          onPressIn={onUserPress ? warmProfile : undefined}
          hitSlop={IDENTITY_HIT_SLOP}
          style={{ flexDirection: "row", alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT, maxWidth: "100%" }}
        >
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
        </Pressable>
        {username ? (
          <Pressable onPress={onUserPress} onPressIn={onUserPress ? warmProfile : undefined} hitSlop={IDENTITY_HIT_SLOP} style={{ maxWidth: "100%" }}>
            <Text
              style={{ color: "#A6A9AC", fontSize: 14, lineHeight: 16, includeFontPadding: false }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              @{username}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          flexShrink: 0,
          alignItems: "center",
          gap: 8,
          alignSelf: "flex-start",
          marginTop: -HEADER_ICON_PAD,
          marginRight: -HEADER_ICON_PAD,
        }}
      >
        {isHidden && <Icon name="EyeOff" size={16} color={ICON_MUTED} />}
        {(onBoostPress || boosted) && (
          <Pressable
            onPress={boltPress}
            disabled={!boltPress}
            accessibilityRole="button"
            accessibilityLabel={onBoostPress ? t("feedCard.boostPost") : t("work.boosted")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ padding: HEADER_ICON_PAD, marginRight: BOOST_END_SPACE }}
          >
            <View style={{ top: CORNER_ICON_DROP }}>
              {boosted ? (
                <LitBolt color={litColor} glow={isLight ? "#18181b" : "#ffffff"} />
              ) : (
                <Icon name="Zap" size={HEADER_ICON_SIZE} color={ICON_MUTED} />
              )}
            </View>
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
            <View style={{ left: MENU_ICON_END_SPACE, top: CORNER_ICON_DROP }}>
              <Icon name="EllipsisVertical" size={HEADER_ICON_SIZE} color={ICON_MUTED} />
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
};

export const FeedCardHeader = memo(FeedCardHeaderComponent);
export default FeedCardHeader;
