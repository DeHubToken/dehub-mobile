import React, { memo, useCallback } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
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
const MARK_HEIGHT = 23;
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
const ISLAND_CAPSULE_HEIGHT = 40;
/** Clear space above and below it. */
const ISLAND_CAPSULE_GAP = 6;
/** Room the capsule takes at the top of the screen; the first post clears it. */
export const ISLAND_BAR_HEIGHT = ISLAND_CAPSULE_HEIGHT + ISLAND_CAPSULE_GAP * 2;
/** DeHub's soft corner (the badge plate, the tab pill): not a full circle. */
const RADIUS = 12;
/** The avatar, and the rows of the feed menu. */
const AVATAR_RADIUS = 8;

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View pointerEvents="none" style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

/**
 * The system theme's home top bar: one small centred capsule floating over
 * the feed with nothing painted around it (HomeScreen slides it away on a
 * scroll down and back on a scroll up).
 * [avatar][mark] | [current tab + chevron] | [bell]. The middle opens and
 * closes the feed menu under it (IslandFeedMenu).
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
  const unread = user?.notificationCount || 0;
  const openNotifications = useCallback(() => navigation.navigate(ScreenNames.Notifications), [navigation]);
  const tab = FEED_NAV_ITEMS[activeIndex] ?? FEED_NAV_ITEMS[0];
  const label = t(TAB_LABEL_KEYS[tab.postType] ?? "feed.home");
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.capsule}>
        <ChromeSurface radius={RADIUS} />
        <Pressable
          onPress={onAvatarPress}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={t("common.openMenu")}
          style={styles.side}
        >
          {isSignedIn ? (
            <View style={styles.avatar}>
              <Avatar
                uri={getAvatarUrl(user?.avatarImageUrl)}
                size={26}
                name={user?.displayName || user?.username}
              />
            </View>
          ) : (
            <Icon name="Menu" size={20} color="#FFFFFF" />
          )}
        </Pressable>
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
        <View style={styles.divider} />
        <Pressable
          onPress={onToggleMenu}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: menuOpen }}
          style={styles.tab}
        >
          {({ pressed }) => (
            <View style={[styles.tabInner, { opacity: pressed ? 0.6 : 1 }]}>
              <Icon name={tab.icon as IconName} size={15} color="#FFFFFF" strokeWidth={2} />
              <Text style={styles.label} numberOfLines={1}>{label}</Text>
              <View style={menuOpen ? styles.chevronOpen : undefined}>
                <Icon name="ChevronDown" size={14} color="rgba(255,255,255,0.7)" />
              </View>
            </View>
          )}
        </Pressable>
        {isSignedIn ? (
          <>
            <View style={styles.divider} />
            <Pressable
              onPress={openNotifications}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={unread > 0 ? t("common.notificationsUnread", { unread }) : t("nav.notifications")}
              style={styles.side}
            >
              <Icon name="Bell" size={19} color="#FFFFFF" />
              <UnreadBadge count={unread} />
            </Pressable>
          </>
        ) : null}
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
    borderRadius: RADIUS,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  side: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  avatar: { width: 26, height: 26, borderRadius: AVATAR_RADIUS, overflow: "hidden" },
  mark: { paddingLeft: 2, paddingRight: 10, flexShrink: 0, justifyContent: "center" },
  divider: { width: 1, height: 18, backgroundColor: "rgba(255,255,255,0.16)" },
  tab: { height: ISLAND_CAPSULE_HEIGHT, justifyContent: "center", paddingHorizontal: 12 },
  tabInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", maxWidth: 110 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
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
  badge: {
    position: "absolute",
    top: -2,
    right: -6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    backgroundColor: "#ef4444",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 12, textAlign: "center" },
});
