import BadgeArtwork from "../common/BadgeArtwork";
import React, { memo, useRef } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Avatar from "../common/Avatar";
import NewMemberChip from "../common/NewMemberChip";
import ChromeSurface from "../ui/ChromeSurface";
import Icon, { type IconName } from "../ui/Icon";
import { getBadgeHoverOpticalStyle as getBadgeOpticalStyle } from "../../libs/misc";
import { openBadgeShowcase, tierForBadgeImage } from "../../libs/badgeShowcase";
import type { MediaTool } from "./feedBleed";

/** Inset of the chip and buttons from the media's edges. */
export const CINEMATIC_EDGE = 12;
/** Round buttons over the media. */
const CINEMATIC_BUTTON = 36;
/** Band along the top of the media the chrome takes; media overlays start below it. */
export const CINEMATIC_TOP_BAND = CINEMATIC_EDGE + CINEMATIC_BUTTON + 8;
/** Side inset of everything under the media (actions, embeds). */
export const CINEMATIC_TEXT_INSET = 14;
/** How far above the media's bottom edge the chrome sits when it is moved
 *  there (the feed's first post): clear of the scrubber and duration badge. */
export const CINEMATIC_BOTTOM_LIFT = 44;
/** The band that chrome then takes along the bottom of the media. */
export const CINEMATIC_BOTTOM_BAND = CINEMATIC_BOTTOM_LIFT + CINEMATIC_BUTTON;
/** Bare icon buttons (the first post): their tap area. */
export const CINEMATIC_BARE_BUTTON = 32;
/** That band while the chrome sits in the true bottom corners, the player
 *  bar hidden. */
export const CINEMATIC_BOTTOM_BAND_LOW = CINEMATIC_EDGE + CINEMATIC_BUTTON;

const AVATAR = 30;
// DeHub's soft corners (the badge plate, the tab pill) rather than circles.
const MENU_RADIUS = 12;
const BUTTON_RADIUS = 10;
const AVATAR_RADIUS = 8;
const HIT = { top: 6, bottom: 6, left: 6, right: 6 };
const BARE_ICON = 22;

/**
 * The author, laid over the media's top-left corner: avatar and name straight
 * on the picture, with a soft shadow under the text instead of a backdrop.
 */
export const CinematicAuthorChip = memo(function CinematicAuthorChip({
  avatarUrl,
  displayName,
  username,
  address,
  badgeImage,
  meta,
  onPress,
}: {
  avatarUrl?: string;
  displayName: string;
  username?: string;
  /** For the "New" member pill. */
  address?: string | null;
  badgeImage?: any;
  /** "time · N views". */
  meta: string;
  onPress?: () => void;
}) {
  const badgeRef = useRef<View>(null);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT}
      accessibilityRole="button"
      accessibilityLabel={username ? `${displayName} @${username}` : displayName}
      style={styles.chip}
    >
      <View style={styles.chipAvatar}>
        <Avatar
          uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined}
          size={AVATAR}
          name={displayName || username}
        />
      </View>
      <View style={styles.chipText}>
        <View style={styles.chipNameRow}>
          <View style={styles.chipNameWrap}>
            <Text style={styles.chipName} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
          {badgeImage ? (
            <Pressable
              ref={badgeRef}
              hitSlop={6}
              onPress={() => openBadgeShowcase(tierForBadgeImage(badgeImage), badgeRef.current)}
              style={{ marginLeft: 3, height: 17, justifyContent: "center" }}
            >
              <BadgeArtwork
                source={badgeImage}
                style={[getBadgeOpticalStyle(badgeImage, 14, 0, 17), { marginLeft: 0 }]}
                resizeMode="contain"
                fadeDuration={0}
              />
            </Pressable>
          ) : null}
          <View style={{ marginLeft: 5 }}>
            <NewMemberChip address={address} overMedia />
          </View>
        </View>
        {meta ? (
          <Text style={styles.chipMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

/** A square-ish button over the media (options, boost, tools). */
export const CinematicIconButton = memo(function CinematicIconButton({
  icon,
  onPress,
  label,
  active = false,
  bare = false,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  /** Its menu is open. */
  active?: boolean;
  /** Just the icon, with a soft shadow and no backing (the first post). */
  bare?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={HIT}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      accessibilityState={onPress ? { expanded: active } : undefined}
      style={bare ? styles.bareButton : styles.button}
    >
      {({ pressed }) => bare ? (
        <View style={[styles.bareIcon, { opacity: pressed ? 0.6 : 1 }]}>
          {/* The shadow: a dark, heavier copy of the glyph under it, which
              reads the same on every platform (Android draws no shadow for
              a view without a fill). iOS adds a soft one on top. */}
          <View style={StyleSheet.absoluteFill}>
            <Icon name={icon} size={BARE_ICON} color="rgba(0,0,0,0.45)" strokeWidth={4} />
          </View>
          <View>
            <Icon name={icon} size={BARE_ICON} color="#FFFFFF" />
          </View>
        </View>
      ) : (
        <>
          <ChromeSurface radius={BUTTON_RADIUS} tinted />
          <View style={{ opacity: pressed ? 0.6 : 1 }}>
            <Icon name={icon} size={18} color="#FFFFFF" />
          </View>
        </>
      )}
    </Pressable>
  );
});

/**
 * The player's own controls (speed, loop, sound, subtitles, picture in
 * picture, full screen), dropped down under the tools button.
 */
export function CinematicToolsMenu({
  tools,
  onClose,
  offset = 0,
  fromBottom,
}: {
  tools: MediaTool[];
  onClose: () => void;
  /** Extra distance from the top of the media, for a chip pushed down. */
  offset?: number;
  /** Opens upward instead, its bottom edge this far above the media's. */
  fromBottom?: number;
}) {
  return (
    <View style={[styles.menu, fromBottom != null ? { bottom: fromBottom } : { top: CINEMATIC_TOP_BAND + offset }]}>
      <ChromeSurface radius={MENU_RADIUS} tinted />
      {tools.map((tool) => (
        <Pressable
          key={tool.key}
          accessibilityRole="button"
          accessibilityLabel={tool.label}
          accessibilityState={tool.active != null ? { selected: tool.active } : undefined}
          onPress={() => {
            tool.onPress();
            onClose();
          }}
          style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}
        >
          <Icon name={tool.icon} size={17} color={tool.active === false ? "rgba(255,255,255,0.6)" : "#FFFFFF"} />
          <Text style={styles.menuLabel} numberOfLines={1}>{tool.label}</Text>
          {tool.active ? <Icon name="Check" size={15} color="#FFFFFF" /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const TEXT_SHADOW = {
  textShadowColor: "rgba(0,0,0,0.75)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
} as const;

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    height: 38,
  },
  chipAvatar: {
    flexShrink: 0,
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR_RADIUS,
    overflow: "hidden",
  },
  chipText: { marginLeft: 7, flex: 1, minWidth: 0 },
  chipNameRow: { flexDirection: "row", alignItems: "center", minWidth: 0, height: 17 },
  chipNameWrap: { flexShrink: 1, minWidth: 0 },
  chipName: { flexShrink: 1, color: "#FFFFFF", fontSize: 14, lineHeight: 17, fontWeight: "600", includeFontPadding: false, ...TEXT_SHADOW },
  chipMeta: { color: "rgba(255,255,255,0.85)", fontSize: 11, lineHeight: 14, includeFontPadding: false, ...TEXT_SHADOW },
  menu: {
    position: "absolute",
    right: CINEMATIC_EDGE,
    minWidth: 210,
    paddingVertical: 6,
    borderRadius: MENU_RADIUS,
    zIndex: 20,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 42,
    paddingHorizontal: 14,
  },
  menuLabel: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  button: {
    width: CINEMATIC_BUTTON,
    height: CINEMATIC_BUTTON,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  bareButton: {
    width: CINEMATIC_BARE_BUTTON,
    height: CINEMATIC_BARE_BUTTON,
    alignItems: "center",
    justifyContent: "center",
  },
  bareIcon: {
    width: BARE_ICON,
    height: BARE_ICON,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
      default: {},
    }),
  },
});
