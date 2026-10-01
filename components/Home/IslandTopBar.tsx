import React, { memo, useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import Icon, { type IconName } from "../ui/Icon";
import ChromeSurface from "../ui/ChromeSurface";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUser, useAuthState } from "../../context/AuthContext";
import { getAvatarUrl } from "../../libs/misc";
import { FEED_NAV_ITEMS } from "./FeedNavBar";

// The DeHub mark cropped to its glyph (143x185), so the size given here is
// the size drawn and its shape can never be squeezed by padding in the file.
const MARK = require("../../assets/web-icons/dehub-mark.png");
const MARK_ASPECT = 143 / 185;
const MARK_HEIGHT = 26;
const HIT = { top: 8, bottom: 8, left: 8, right: 8 };
// The brand name, spoken for the mark. Not translated.
const BRAND_NAME = "DeHub";

// i18n keys for each tab's short name, by post type.
const TAB_LABEL_KEYS: Record<string, string> = {
  all: "feed.home",
  short: "feed.shorts",
  "feed-images": "feed.images",
  video: "feed.videos",
  "feed-audio": "feed.music",
  live: "feed.live",
};

/** Height of the capsule. */
const ISLAND_CAPSULE_HEIGHT = 44;
/** Clear space above and below it. */
const ISLAND_CAPSULE_GAP = 6;
/** Room the capsule takes at the top of the screen; the first post clears it. */
export const ISLAND_BAR_HEIGHT = ISLAND_CAPSULE_HEIGHT + ISLAND_CAPSULE_GAP * 2;
/** The capsule's corner. */
const CAPSULE_RADIUS = 15;
/** DeHub's soft corner (the badge plate, the tab pill): not a full circle. */
const RADIUS = 12;
/** The avatar, and the rows of the feed menu. */
const AVATAR_RADIUS = 8;
const AVATAR_SIZE = 28;

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View pointerEvents="none" style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

/**
 * The system theme's home top bar: one centred capsule floating over the feed
 * with nothing painted around it (HomeScreen slides it away on a scroll down
 * and back on a scroll up). Laid out as a crest, three columns with the mark
 * dead centre: [feed name  chevron] [mark] [bell  avatar]. It hugs its
 * contents, with both side columns as wide as the wider one. The feed name
 * opens and closes the feed menu under it (IslandFeedMenu).
 */
export const IslandCapsule = memo(function IslandCapsule({
  activeIndex,
  menuOpen,
  onToggleMenu,
  onAvatarPress,
  onLogoPress,
}: {
  activeIndex: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** Avatar: opens the drawer. */
  onAvatarPress?: () => void;
  /** Mark: scrolls the feed to the top and refreshes it. */
  onLogoPress?: () => void;
}) {
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const navigation = useNavigation<any>();
  const { width: screenWidth } = useWindowDimensions();
  const unread = user?.notificationCount || 0;
  const openNotifications = useCallback(() => navigation.navigate(ScreenNames.Notifications), [navigation]);
  const tab = FEED_NAV_ITEMS[activeIndex] ?? FEED_NAV_ITEMS[0];
  const label = t(TAB_LABEL_KEYS[tab.postType] ?? "feed.home");
  // Each side reports its natural width and both columns take the wider one,
  // so the capsule hugs its contents and the mark still lands dead centre.
  const [sides, setSides] = useState({ left: 0, right: 0 });
  const side = Math.max(sides.left, sides.right);
  const onLeft = useCallback((e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setSides((s) => (s.left === w ? s : { ...s, left: w }));
  }, []);
  const onRight = useCallback((e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setSides((s) => (s.right === w ? s : { ...s, right: w }));
  }, []);
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.capsule, { maxWidth: screenWidth - 32, opacity: side ? 1 : 0 }]}>
        <ChromeSurface radius={CAPSULE_RADIUS} />
        <View style={[styles.left, { width: side || undefined }]}>
          <View onLayout={onLeft} style={styles.sideInner}>
            <Pressable
              onPress={onToggleMenu}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded: menuOpen }}
              style={styles.tab}
            >
              {({ pressed }) => (
                <View style={[styles.tabInner, { opacity: pressed ? 0.6 : 1 }]}>
                  <Text style={styles.label} numberOfLines={1}>{label}</Text>
                  <View style={menuOpen ? styles.chevronOpen : undefined}>
                    <Icon name="ChevronDown" size={15} color="rgba(255,255,255,0.75)" strokeWidth={2.4} />
                  </View>
                </View>
              )}
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={onLogoPress}
          hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
          accessibilityRole="button"
          accessibilityLabel={BRAND_NAME}
          accessibilityHint={t("common.scrollsFeedToTop")}
          style={styles.mark}
        >
          <Image
            source={MARK}
            resizeMode="contain"
            fadeDuration={0}
            style={{ width: Math.round(MARK_HEIGHT * MARK_ASPECT), height: MARK_HEIGHT, tintColor: "#FFFFFF" }}
          />
        </Pressable>
        <View style={[styles.right, { width: side || undefined }]}>
          <View onLayout={onRight} style={styles.sideInner}>
            {isSignedIn ? (
              <Pressable
                onPress={openNotifications}
                hitSlop={HIT}
                accessibilityRole="button"
                accessibilityLabel={unread > 0 ? t("common.notificationsUnread", { unread }) : t("nav.notifications")}
                style={styles.bell}
              >
                <Icon name="Bell" size={21} color="#FFFFFF" strokeWidth={1.9} />
                <UnreadBadge count={unread} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onAvatarPress}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={t("common.openMenu")}
              style={styles.avatarButton}
            >
              {isSignedIn ? (
                <View style={styles.avatar}>
                  <Avatar
                    uri={getAvatarUrl(user?.avatarImageUrl)}
                    size={AVATAR_SIZE}
                    name={user?.displayName || user?.username}
                  />
                </View>
              ) : (
                <Icon name="Menu" size={22} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
});

/**
 * The capsule's dropdown: one row per feed (a pick switches the pager, as a
 * swipe would), then Filters, which opens the current feed's filter panel.
 * Drawn in the capsule's own material.
 */
export const IslandFeedMenu = memo(function IslandFeedMenu({
  activeIndex,
  onSelect,
  onFilters,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  onFilters: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View pointerEvents="box-none" style={styles.menuWrap}>
      <View style={styles.menu}>
        <ChromeSurface radius={RADIUS} />
        {FEED_NAV_ITEMS.map((item, index) => {
          const current = index === activeIndex;
          return (
            <Pressable
              key={item.postType}
              onPress={() => onSelect(index)}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: current }}
              style={({ pressed }) => [styles.menuRow, (pressed || current) && styles.menuRowOn]}
            >
              <Icon name={item.icon as IconName} size={17} color="#FFFFFF" strokeWidth={current ? 2.2 : 1.8} />
              <Text style={styles.menuLabel} numberOfLines={1}>
                {t(TAB_LABEL_KEYS[item.postType] ?? "feed.home")}
              </Text>
              {current ? <Icon name="Check" size={16} color="#FFFFFF" strokeWidth={2.2} /> : null}
            </Pressable>
          );
        })}
        <View style={styles.menuDivider} />
        <Pressable
          onPress={onFilters}
          accessibilityRole="menuitem"
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowOn]}
        >
          <Icon name="SlidersHorizontal" size={17} color="#FFFFFF" strokeWidth={1.8} />
          <Text style={styles.menuLabel} numberOfLines={1}>{t("filters.filters")}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    height: ISLAND_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  capsule: {
    height: ISLAND_CAPSULE_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  left: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
  right: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  sideInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarButton: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, overflow: "hidden" },
  mark: { paddingHorizontal: 12, flexShrink: 0, justifyContent: "center", alignItems: "center" },
  tab: { height: ISLAND_CAPSULE_HEIGHT, justifyContent: "center", paddingLeft: 4 },
  tabInner: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { maxWidth: 96, color: "#FFFFFF", fontSize: 14, fontWeight: "600", letterSpacing: -0.14 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  bell: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  menuWrap: { alignItems: "center" },
  menu: {
    width: 220,
    padding: 6,
    borderRadius: RADIUS,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: AVATAR_RADIUS,
  },
  menuRowOn: { backgroundColor: "rgba(255,255,255,0.10)" },
  menuLabel: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  menuDivider: { height: 1, marginVertical: 6, marginHorizontal: 6, backgroundColor: "rgba(255,255,255,0.12)" },
  // Off the glyph's top right corner (the glyph is 21pt in a 28pt box).
  badge: {
    position: "absolute",
    top: 0,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    backgroundColor: "#ef4444",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700", lineHeight: 11, textAlign: "center" },
});
