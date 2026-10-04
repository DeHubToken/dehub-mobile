import { useFeedPillRefreshing, setFeedPillMounted } from '../../libs/feed-pill-refresh';
import React, { memo, useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, ReduceMotion, withTiming } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import ElectricLogo from "../common/ElectricLogo";
import Avatar from "../common/Avatar";
import Icon, { type IconName } from "../ui/Icon";
import NavPillSurface, { NAV_PILL_RADIUS, NAV_PILL_SHADOW } from "../ui/NavPillSurface";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUser, useAuthState, useAuthActions } from "../../context/AuthContext";
import { getAvatarUrl } from "../../libs/misc";
import { FEED_NAV_ITEMS } from "./FeedNavBar";

// Match the web drawer's 200ms height reveal from behind the capsule.
const menuEnter = (values: { targetHeight: number }) => {
  "worklet";
  const timing = { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
  return {
    initialValues: { height: 0, opacity: 0, transform: [{ translateY: -8 }] },
    animations: { height: withTiming(values.targetHeight, timing), opacity: withTiming(1, timing), transform: [{ translateY: withTiming(0, timing) }] },
  };
};
const menuExit = (values: { currentHeight: number }) => {
  "worklet";
  const timing = { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
  return {
    initialValues: { height: values.currentHeight, opacity: 1, transform: [{ translateY: 0 }] },
    animations: { height: withTiming(0, timing), opacity: withTiming(0, timing), transform: [{ translateY: withTiming(-8, timing) }] },
  };
};

// Use the same padded artwork and image box as the web capsule.
const MARK = require("../../assets/web-icons/dehub-island-logo.png");
const MARK_HEIGHT = 27.3;
export const ISLAND_CAPSULE_WIDTH = 147.5;
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
export const ISLAND_CAPSULE_GAP = 6;
/** Room the capsule takes at the top of the screen; the first post clears it. */
export const ISLAND_BAR_HEIGHT = ISLAND_CAPSULE_HEIGHT + ISLAND_CAPSULE_GAP * 2;
/** The capsule's corner. */
const CAPSULE_RADIUS = NAV_PILL_RADIUS;
/** DeHub's soft corner (the badge plate, the tab pill): not a full circle. */
const RADIUS = 15;
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
 * dead centre: [avatar, or a burger when signed out] [mark] [bell]. It hugs
 * its contents, with both side columns as wide as the wider one. The mark
 * opens and closes the feed menu under it (IslandFeedMenu); the avatar opens
 * the drawer; signed out, the burger and the bell ask you to log in.
 */
export const IslandCapsule = memo(function IslandCapsule({
  activeIndex,
  menuOpen,
  onToggleMenu,
  onAvatarPress,
}: {
  activeIndex: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** Avatar: opens the drawer. */
  onAvatarPress?: () => void;
}) {
  const refreshing = useFeedPillRefreshing();
  const pillId = useRef(Symbol("feed-pill")).current;
  useEffect(() => { setFeedPillMounted(pillId, true); return () => setFeedPillMounted(pillId, false); }, [pillId]);
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const navigation = useNavigation<any>();
  const { width: screenWidth } = useWindowDimensions();
  const unread = user?.notificationCount || 0;
  const { requireAuth } = useAuthActions();
  // Signed out, the burger and the bell both ask you to log in first.
  const onLeftPress = useCallback(
    () => (isSignedIn ? onAvatarPress?.() : requireAuth(() => {})),
    [isSignedIn, onAvatarPress, requireAuth],
  );
  const onBellPress = useCallback(
    () => requireAuth(() => navigation.navigate(ScreenNames.Notifications)),
    [navigation, requireAuth],
  );
  const tab = FEED_NAV_ITEMS[activeIndex] ?? FEED_NAV_ITEMS[0];
  const label = t(TAB_LABEL_KEYS[tab.postType] ?? "feed.home");
  // Both controls have a fixed 28pt box. Avoid feeding Android layout
  // measurements back into their parent width on every layout pass.
  const side = AVATAR_SIZE;
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.capsule, { maxWidth: screenWidth - 32, opacity: side ? 1 : 0 }]}>
        <NavPillSurface />
        <View style={[styles.left, { width: side || undefined }]}>
          <View style={styles.sideInner}>
            <Pressable
              onPress={onLeftPress}
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
                <Icon name="Menu" size={24} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
        </View>
        <ElectricLogo refreshing={refreshing} onPress={onToggleMenu} source={MARK} width={31.5}
          height={MARK_HEIGHT} tint="#FFFFFF" label={`${BRAND_NAME}, ${label}`}
          expanded={menuOpen} style={styles.mark}
          hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }} />
        <View style={[styles.right, { width: side || undefined }]}>
          <View style={styles.sideInner}>
            <Pressable
              onPress={onBellPress}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={unread > 0 ? t("common.notificationsUnread", { unread }) : t("nav.notifications")}
              style={styles.bell}
            >
              <Icon name="Bell" size={21} color="#FFFFFF" strokeWidth={1.9} />
              <UnreadBadge count={unread} />
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
  onMenu,
  onClose,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  onFilters: () => void;
  onMenu: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { requireAuth } = useAuthActions();
  const navigation = useNavigation<any>();
  return (
    <Animated.View entering={menuEnter} exiting={menuExit} pointerEvents="box-none" style={styles.menuWrap}>
      <View style={styles.menu}>
        <NavPillSurface />
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
              <Icon name={item.icon as IconName} size={16} color="#FFFFFF" strokeWidth={current ? 2.2 : 1.8} />
              <Text style={styles.menuLabel}>
                {t(TAB_LABEL_KEYS[item.postType] ?? "feed.home")}
              </Text>
              {current ? <Icon name="Check" size={16} color="#FFFFFF" strokeWidth={2.2} /> : null}
            </Pressable>
          );
        })}
        <View style={styles.menuDivider} />
        <View style={{ flexDirection: "row" }}>
          <Pressable onPress={onFilters} accessibilityRole="menuitem" accessibilityLabel={t("filters.filters")} style={styles.footerButton}>
            <Icon name="SlidersHorizontal" size={16} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={onMenu} accessibilityRole="menuitem" accessibilityLabel={t("common.openMenu")} style={styles.footerButton}>
            <Icon name="LayoutGrid" size={16} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => { onClose(); requireAuth(() => navigation.navigate(ScreenNames.Upload)); }} accessibilityRole="menuitem" accessibilityLabel={t("sidebar.post")} style={styles.footerButton}>
            <Icon name="Plus" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    height: ISLAND_BAR_HEIGHT,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  capsule: {
    height: ISLAND_CAPSULE_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    width: ISLAND_CAPSULE_WIDTH,
    zIndex: 2,
    ...NAV_PILL_SHADOW,
  },
  left: { minWidth: AVATAR_SIZE, flexDirection: "row", alignItems: "center", justifyContent: "flex-start" },
  right: { minWidth: AVATAR_SIZE, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  sideInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarButton: { width: AVATAR_SIZE, height: AVATAR_SIZE, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_RADIUS, overflow: "hidden" },
  mark: { paddingHorizontal: 20, height: ISLAND_CAPSULE_HEIGHT, flexShrink: 0, justifyContent: "center", alignItems: "center" },
  bell: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  menuWrap: { position: "absolute", top: ISLAND_CAPSULE_GAP, left: 0, right: 0, alignItems: "center", zIndex: 1, overflow: "hidden" },
  menu: {
    width: ISLAND_CAPSULE_WIDTH,
    padding: 6,
    paddingTop: ISLAND_CAPSULE_HEIGHT + 6,
    borderRadius: CAPSULE_RADIUS,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  footerButton: { flex: 1, height: 40, alignItems: "center", justifyContent: "center" },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  menuRowOn: { backgroundColor: "rgba(255,255,255,0.15)" },
  menuLabel: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  menuDivider: { height: 1, marginVertical: 4, marginHorizontal: 8, backgroundColor: "rgba(255,255,255,0.15)" },
  // Off the glyph's top right corner (the glyph is 26.9pt in a 28pt box).
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

