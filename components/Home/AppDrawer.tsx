import React, { useCallback, useEffect, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Platform,
  BackHandler,
} from "react-native";
import { BlurView } from "expo-blur";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
  interpolate,
} from "react-native-reanimated";
import Avatar from "../common/Avatar";
import Icon, { type IconName } from "../ui/Icon";
import { useUser, useAuthState } from "../../context/AuthContext";
import { useStages } from "../../context/StageContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config/links";
import { getAvatarUrl } from "../../libs/misc";
import { toastInfo } from "../../libs";
import { openInApp } from "../../libs/links.utils";
import { useTranslation } from "react-i18next";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

const OPEN_TIMING = { duration: 280, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
const CLOSE_TIMING = { duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

const VELOCITY_THRESHOLD = 500;
const POSITION_THRESHOLD = DRAWER_WIDTH * 0.4;

interface DrawerItem {
  icon: IconName;
  /** i18n key for the label (resolved with t() at render). */
  labelKey: string;
  screen?: string;
  params?: Record<string, any>;
  url?: string;
  requiresAuth?: boolean;
  /** Screen lives inside the bottom-tab navigator (Root), so it needs nested navigation. */
  tab?: boolean;
  /**
   * Feature that is presented as a global modal rather than a route. Handled in
   * handleItemPress — NAV_ITEMS is module-level so it cannot hold hook-derived
   * callbacks directly.
   */
  action?: "stages";
  disabled?: boolean;
  disabledMessage?: string;
}

// Mirrors the web sidebar (NAV_ITEMS in cosmic-echo-hero's app.constants) —
// same order, labels and icons. Items with a native screen navigate in-app;
// the rest open the corresponding page on the website.
const NAV_ITEMS: DrawerItem[] = [
  { icon: "House", labelKey: "nav.home", screen: ScreenNames.Home, tab: true },
  { icon: "User", labelKey: "nav.profile", screen: ScreenNames.Profile, requiresAuth: true },
  { icon: "Search", labelKey: "nav.explore", screen: ScreenNames.Explore, tab: true },
  { icon: "Wand", labelKey: "nav.prompt", screen: ScreenNames.Prompt },
  { icon: "Bell", labelKey: "nav.notifications", screen: ScreenNames.Notifications, requiresAuth: true },
  { icon: "MessageSquare", labelKey: "nav.messages", screen: ScreenNames.DM, requiresAuth: true, tab: true },
  { icon: "Users", labelKey: "nav.communities", screen: ScreenNames.Communities },
  { icon: "Sparkles", labelKey: "nav.assistant", screen: ScreenNames.AIChat, tab: true },
  { icon: "Settings", labelKey: "nav.settings", screen: ScreenNames.AccountSettings, requiresAuth: true },
  { icon: "Trophy", labelKey: "nav.leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", labelKey: "nav.bookmarks", screen: ScreenNames.MyLibrary, requiresAuth: true },
  { icon: "LayoutDashboard", labelKey: "nav.command", screen: ScreenNames.CommandCentre, requiresAuth: true },
  // Passes initialTab explicitly so returning here from the Staking entry
  // (same screen, different tab) resets to Buy instead of keeping Stake.
  { icon: "Wallet", labelKey: "nav.wallet", screen: ScreenNames.Dpay, params: { initialTab: "buy" }, requiresAuth: true },
  { icon: "CalendarDays", labelKey: "nav.events", screen: ScreenNames.Events },
  // Stages is modal-based on native (StagesModalsHost is mounted app-wide in
  // App.tsx), so it opens the browse modal instead of navigating to a route.
  { icon: "Mic", labelKey: "nav.stages", action: "stages" },
  { icon: "Lightbulb", labelKey: "nav.featureRequests", screen: ScreenNames.FeatureRequests },
  // Staking lives as a tab inside the wallet (Dpay) screen rather than its own
  // route, so it deep-links there. Web has it as a separate sidebar entry.
  { icon: "Vault", labelKey: "nav.staking", screen: ScreenNames.Dpay, params: { initialTab: "stake" }, requiresAuth: true },
  { icon: "ShieldCheck", labelKey: "nav.governance", screen: ScreenNames.Governance },
  { icon: "Briefcase", labelKey: "screens.work", screen: ScreenNames.Work },
  { icon: "Users", labelKey: "nav.affiliate", screen: ScreenNames.Affiliate, requiresAuth: true },
  { icon: "Briefcase", labelKey: "nav.careers", screen: ScreenNames.Careers },
  { icon: "Store", labelKey: "screens.stores", screen: ScreenNames.Stores },
  { icon: "Megaphone", labelKey: "nav.ads", screen: ScreenNames.Ads, requiresAuth: true },
  { icon: "Tv", labelKey: "nav.tv", screen: ScreenNames.TV },
  // Sits between Stores and Glossary, as on the web sidebar. Only the games
  // that work on a touchscreen are listed — see config/arcade-games.
  { icon: "Gamepad2", labelKey: "nav.arcade", screen: ScreenNames.Arcade },
  { icon: "Scroll", labelKey: "nav.glossary", screen: ScreenNames.Glossary },
  { icon: "Map", labelKey: "nav.guide", screen: ScreenNames.Guide },
  { icon: "BookOpen", labelKey: "nav.docs", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", labelKey: "nav.blog", url: `${WEBSITE_LINK}/docs/blog` },
];

interface MenuItemProps {
  icon: IconName;
  label: string;
  labelKey: string;
  testLabel: string;
  soonLabel: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}

// Items that carry a small "Test" badge on the web sidebar (matched by key
// since labels are now translated).
const TEST_BADGE_KEYS = new Set(["nav.prompt", "screens.work", "screens.stores"]);

const MenuItem = memo<MenuItemProps>(({ icon, label, labelKey, testLabel, soonLabel, onPress, disabled, active }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={label}
    className="flex-row items-center gap-3.5 px-3 py-3 mx-2 rounded-xl"
    activeOpacity={disabled ? 1 : 0.6}
    onPress={onPress}
    style={[styles.itemBase, active && styles.itemActive, disabled ? { opacity: 0.45 } : null]}
  >
    {/* Icon chip — matches web's translucent rounded-square with hairline border,
        brighter when the item is the active route (web's active icon container). */}
    <View style={[styles.iconChip, active && styles.iconChipActive]}>
      <Icon name={icon} size={22} color={disabled ? "#6b7280" : "#FFFFFF"} strokeWidth={active ? 2 : 1.8} />
      {TEST_BADGE_KEYS.has(labelKey) && (
        <View style={styles.testBadge}>
          <Text style={styles.testBadgeText}>{testLabel}</Text>
        </View>
      )}
    </View>
    <Text
      className={`text-[15px] ${disabled ? "text-neutral-500" : "text-white"}`}
      style={[styles.itemLabel, active && styles.itemLabelActive]}
      numberOfLines={1}
    >
      {label}
    </Text>
    {disabled && (
      <View className="bg-white/10 rounded-full px-2 py-0.5">
        <Text className="text-[10px] text-neutral-400 font-medium">{soonLabel}</Text>
      </View>
    )}
  </TouchableOpacity>
));

interface FollowStatProps {
  count: number;
  label: string;
  onPress: () => void;
}

const FollowStat = memo<FollowStatProps>(({ count, label, onPress }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
    <Text className="text-white text-sm">
      <Text className="font-bold">{count}</Text>
      <Text className="text-neutral-400"> {label}</Text>
    </Text>
  </TouchableOpacity>
));

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
}

const AppDrawer: React.FC<AppDrawerProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const { t } = useTranslation();
  const { openModal: openStages } = useStages();

  // Current route name, so the matching drawer item highlights like the web
  // sidebar. Tab screens live nested under Root — descend into it to find them.
  const activeRouteName = useNavigationState((state: any) => {
    if (!state) return undefined;
    const top = state.routes?.[state.index];
    if (top?.name === ScreenNames.Root) {
      const nested = top.state;
      if (nested && typeof nested.index === "number") {
        return nested.routes?.[nested.index]?.name;
      }
      return ScreenNames.Home;
    }
    return top?.name;
  });

  const progress = useSharedValue(0);
  const dragging = useSharedValue(false);

  useEffect(() => {
    if (!dragging.value) {
      progress.value = withTiming(visible ? 1 : 0, visible ? OPEN_TIMING : CLOSE_TIMING);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((e) => {
      const clamped = Math.max(0, Math.min(1, 1 + e.translationX / DRAWER_WIDTH));
      progress.value = clamped;
    })
    .onEnd((e) => {
      dragging.value = false;
      const shouldClose =
        e.velocityX < -VELOCITY_THRESHOLD ||
        (e.velocityX <= VELOCITY_THRESHOLD && progress.value < 1 - POSITION_THRESHOLD / DRAWER_WIDTH);

      if (shouldClose) {
        progress.value = withTiming(0, CLOSE_TIMING);
        runOnJS(onClose)();
      } else {
        progress.value = withTiming(1, OPEN_TIMING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-DRAWER_WIDTH, 0]) },
    ],
  }));

  const navigate = useCallback(
    (screen: string, params?: Record<string, any>, tab?: boolean) => {
      onClose();
      setTimeout(() => {
        // Tab screens live inside the bottom-tab navigator (Root); navigating to
        // them directly from the root stack fails, so target the nested screen.
        if (tab) {
          navigation.navigate(ScreenNames.Root, { screen, params });
        } else {
          navigation.navigate(screen, params);
        }
      }, 260);
    },
    [navigation, onClose],
  );

  const handleItemPress = useCallback(
    (item: DrawerItem) => {
      if (item.disabled) {
        toastInfo(item.disabledMessage ?? t("screens.comingSoon"));
        return;
      }
      if (item.action === "stages") {
        onClose();
        // Match navigate()'s delay so the drawer finishes closing before the
        // stage modal slides up — otherwise the two animations fight.
        setTimeout(() => openStages("browse"), 260);
      } else if (item.url) {
        onClose();
        openInApp(item.url);
      } else if (item.screen) {
        navigate(item.screen, item.params, item.tab);
      }
    },
    [navigate, onClose, t, openStages],
  );

  const displayName = user?.displayName || user?.username || t("common.anonymous");
  const handle = user?.username ? `@${user.username}` : "";
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl);
  const hasAvatar = !!user?.avatarImageUrl;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 999 }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.drawer, drawerStyle, { width: DRAWER_WIDTH }]}
        >
          {/* Web sidebar parity: bg-black/60 + backdrop-blur(24px) +
              border-white/10. The blur samples what's behind the drawer;
              glassOverlay supplies the black/60 wash on top. */}
          {Platform.OS === "ios" ? (
            <BlurView
              intensity={70}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            // Real backdrop blur on Android via dimezisBlurView (intensity ~95
            // ≈ web's 24px radius). Only mount it while the drawer is open:
            // the drawer stays mounted off-screen, and dimezis re-snapshots
            // the whole root every frame, crashing with
            // IndexOutOfBoundsException when the feed list mutates during its
            // pre-draw pass.
            visible && (
              <BlurView
                intensity={95}
                tint="dark"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
            )
          )}
          <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />

          {/* Plain padding, NOT insets.top/insets.bottom. This drawer lives
              inside the navigator, and the navigator is already wrapped in a
              full-edge <SafeAreaView> up in App.tsx's BootGate — so the panel's
              own top: 0 is already below the status bar. Adding the device
              inset again here counted it twice, which pushed the profile block
              down by a second notch-height and left a dead band above it. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: 16,
              paddingBottom: 24,
            }}
          >
            {isSignedIn && user ? (
              <View className="px-5 pb-4 mb-2">
                <TouchableOpacity
                  onPress={() => navigate(ScreenNames.Profile)}
                  activeOpacity={0.7}
                >
                  {hasAvatar ? (
                    <Avatar uri={avatarUrl} size={48} name={displayName || handle} />
                  ) : (
                    <Avatar uri={undefined} size={48} name={displayName || handle} />
                  )}
                  <Text className="text-white text-base font-semibold mt-3">{displayName}</Text>
                  {handle ? (
                    <Text className="text-neutral-400 text-sm mt-0.5">{handle}</Text>
                  ) : null}
                </TouchableOpacity>

                <View className="flex-row mt-3 gap-4">
                  <FollowStat
                    count={user.followings ?? 0}
                    label={t("profile.following")}
                    onPress={() =>
                      navigate(ScreenNames.FollowList, {
                        address: user.walletAddress || user.address,
                        username: user.username,
                        initialTab: "following",
                        isOwnProfile: true,
                      })
                    }
                  />
                  <FollowStat
                    count={user.followers ?? 0}
                    label={t("profile.followers")}
                    onPress={() =>
                      navigate(ScreenNames.FollowList, {
                        address: user.walletAddress || user.address,
                        username: user.username,
                        initialTab: "followers",
                        isOwnProfile: true,
                      })
                    }
                  />
                </View>
              </View>
            ) : (
              <View className="px-5 pb-4 mb-2">
                <TouchableOpacity
                  className="flex-row items-center"
                  onPress={() => navigate(ScreenNames.SignIn)}
                  activeOpacity={0.7}
                >
                  <View className="w-12 h-12 rounded-full bg-white/10 items-center justify-center">
                    <Icon name="User" size={24} color="#9CA3AF" />
                  </View>
                  <View className="ml-3">
                    <Text className="text-white text-base font-semibold">{t("screens.signIn")}</Text>
                    <Text className="text-neutral-400 text-sm">{t("screens.tapToGetStarted")}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View className="py-2">
              {NAV_ITEMS.filter((item) => isSignedIn || !item.requiresAuth).map((item) => (
                <MenuItem
                  key={item.labelKey}
                  icon={item.icon}
                  label={t(item.labelKey)}
                  labelKey={item.labelKey}
                  testLabel={t("common.test")}
                  soonLabel={t("screens.soon")}
                  disabled={item.disabled}
                  active={!!item.screen && item.screen === activeRouteName}
                  onPress={() => handleItemPress(item)}
                />
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
    zIndex: 999,
    elevation: 10,
    // Web: border border-white/10 — hairline on the exposed edge.
    borderRightWidth: 1,
    borderRightColor: "rgba(255, 255, 255, 0.10)",
  },
  // Web: bg-black/60 over the backdrop blur, but lighter here so the blur
  // reads through more — the dark BlurView tint already darkens on top.
  glassOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.0)",
  },
  // Transparent border on every row keeps height stable when the active border appears.
  itemBase: {
    borderWidth: 1,
    borderColor: "transparent",
  },
  // Active row — web's liquid-glass indicator pill (gradient white + hairline border).
  itemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  iconChipActive: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  itemLabel: {
    flex: 1,
    fontWeight: "500",
  },
  itemLabelActive: {
    fontWeight: "700",
  },
  testBadge: {
    position: "absolute",
    top: -5,
    alignSelf: "center",
    paddingHorizontal: 3,
    height: 12,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  testBadgeText: {
    color: "#000000",
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});

export default memo(AppDrawer);
