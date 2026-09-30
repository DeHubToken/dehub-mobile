import React, { memo, useRef } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Avatar from "../common/Avatar";
import NewMemberChip from "../common/NewMemberChip";
import ChromeSurface from "../ui/ChromeSurface";
import Icon, { type IconName } from "../ui/Icon";
import { getBadgeOpticalStyle } from "../../libs/misc";
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

const AVATAR = 30;
// DeHub's soft corners (the badge plate, the tab pill) rather than circles.
const MENU_RADIUS = 12;
const BUTTON_RADIUS = 10;
const AVATAR_RADIUS = 8;
const HIT = { top: 6, bottom: 6, left: 6, right: 6 };

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
            {/* A wide, soft shadow under the tight one: RN draws one shadow
                per Text, so the name is drawn twice. */}
            <Text style={[styles.chipName, styles.chipNameGlow]} numberOfLines={1} aria-hidden>
              {displayName}
            </Text>
            <Text style={styles.chipName} numberOfLines={1}>
              {displayName}
            </Text>
          </View>
          {badgeImage ? (
            <Pressable
              ref={badgeRef}
              hitSlop={6}
              onPress={() => openBadgeShowcase(tierForBadgeImage(badgeImage), badgeRef.current)}
              style={{ marginLeft: 3, height: 16, justifyContent: "center" }}
            >
              <Image
                source={badgeImage}
                style={[getBadgeOpticalStyle(badgeImage, 13, 0, 16), { marginLeft: 0 }]}
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
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  /** Its menu is open. */
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={HIT}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      accessibilityState={onPress ? { expanded: active } : undefined}
      style={styles.button}
    >
      {({ pressed }) => (
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
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "72%",
    height: 38,
  },
  chipAvatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR_RADIUS,
    overflow: "hidden",
  },
  chipText: { marginLeft: 7, flexShrink: 1, minWidth: 0 },
  chipNameRow: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  chipNameWrap: { flexShrink: 1, minWidth: 0 },
  chipNameGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  chipName: { flexShrink: 1, color: "#FFFFFF", fontSize: 14, lineHeight: 17, fontWeight: "600", ...TEXT_SHADOW },
  chipMeta: { color: "rgba(255,255,255,0.85)", fontSize: 11, lineHeight: 14, ...TEXT_SHADOW },
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
});
