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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config/links";
import { getAvatarUrl } from "../../libs/misc";
import { toastInfo } from "../../libs";
import { openInApp } from "../../libs/links.utils";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

const OPEN_TIMING = { duration: 280, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
const CLOSE_TIMING = { duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

const VELOCITY_THRESHOLD = 500;
const POSITION_THRESHOLD = DRAWER_WIDTH * 0.4;

interface DrawerItem {
  icon: IconName;
  label: string;
  screen?: string;
  params?: Record<string, any>;
  url?: string;
  requiresAuth?: boolean;
  /** Screen lives inside the bottom-tab navigator (Root), so it needs nested navigation. */
  tab?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

// Mirrors the web sidebar (NAV_ITEMS in cosmic-echo-hero's app.constants) —
// same order, labels and icons. Items with a native screen navigate in-app;
// the rest open the corresponding page on the website.
const NAV_ITEMS: DrawerItem[] = [
  { icon: "User", label: "Profile", screen: ScreenNames.Profile, requiresAuth: true },
  { icon: "Search", label: "Explore", screen: ScreenNames.Explore, tab: true },
  // Prompt has no native screen yet — commented out rather than dumping users
  // to the website. Restore (or build a native screen) when ready.
  // { icon: "Wand", label: "Prompt", url: `${WEBSITE_LINK}/prompt` },
  { icon: "Bell", label: "Notifications", screen: ScreenNames.Notifications, requiresAuth: true },
  { icon: "MessageSquare", label: "Messages", screen: ScreenNames.DM, requiresAuth: true, tab: true },
  { icon: "Users", label: "Communities", screen: ScreenNames.Communities },
  { icon: "Sparkles", label: "Assistant", screen: ScreenNames.AIChat, tab: true },
  { icon: "Trophy", label: "Leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", label: "Bookmarks", screen: ScreenNames.MyLibrary, requiresAuth: true },
  { icon: "Settings", label: "Settings", screen: ScreenNames.AccountSettings, requiresAuth: true },
  // Command Centre has no native screen yet — commented out (was opening the website).
  // { icon: "LayoutDashboard", label: "Command", url: `${WEBSITE_LINK}/app/command-centre` },
  { icon: "Wallet", label: "Wallet", screen: ScreenNames.Dpay, requiresAuth: true },
  { icon: "CalendarDays", label: "Events", screen: ScreenNames.Events },
  { icon: "Lightbulb", label: "Feature Requests", url: `${WEBSITE_LINK}/features` },
  // Staking is web3-heavy (contracts) — commented out for now.
  // { icon: "Vault", label: "Staking", url: `${WEBSITE_LINK}/app/stake` },
  { icon: "ShieldCheck", label: "Governance", screen: ScreenNames.Governance },
  { icon: "Briefcase", label: "Work", url: `${WEBSITE_LINK}/work` },
  { icon: "Briefcase", label: "Careers", screen: ScreenNames.Careers },
  { icon: "Store", label: "Stores", url: `${WEBSITE_LINK}/app/stores` },
  { icon: "Scroll", label: "Glossary", screen: ScreenNames.Glossary },
  { icon: "Map", label: "Guide", screen: ScreenNames.Guide },
  { icon: "BookOpen", label: "Docs", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", label: "Blog", url: `${WEBSITE_LINK}/docs/blog` },
  { icon: "House", label: "Home", screen: ScreenNames.Home, tab: true },
];

interface MenuItemProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}

// Labels that carry a small "Test" badge on the web sidebar.
const TEST_BADGE_LABELS = new Set(["Prompt", "Work", "Stores"]);

const MenuItem = memo<MenuItemProps>(({ icon, label, onPress, disabled, active }) => (
  <TouchableOpacity
    className="flex-row items-center gap-3.5 px-3 py-3 mx-2 rounded-2xl"
    activeOpacity={disabled ? 1 : 0.6}
    onPress={onPress}
    style={[styles.itemBase, active && styles.itemActive, disabled ? { opacity: 0.45 } : null]}
  >
    {/* Icon chip — matches web's translucent rounded-square with hairline border,
        brighter when the item is the active route (web's active icon container). */}
    <View style={[styles.iconChip, active && styles.iconChipActive]}>
      <Icon name={icon} size={22} color={disabled ? "#6b7280" : "#FFFFFF"} strokeWidth={active ? 2 : 1.8} />
      {TEST_BADGE_LABELS.has(label) && (
        <View style={styles.testBadge}>
          <Text style={styles.testBadgeText}>Test</Text>
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
        <Text className="text-[10px] text-neutral-400 font-medium">Soon</Text>
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();

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
        toastInfo(item.disabledMessage ?? "Coming soon");
        return;
      }
      if (item.url) {
        onClose();
        openInApp(item.url);
      } else if (item.screen) {
        navigate(item.screen, item.params, item.tab);
      }
    },
    [navigate, onClose],
  );

  const displayName = user?.displayName || user?.username || "Anonymous";
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
          {Platform.OS === "ios" ? (
            <BlurView
              intensity={100}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            // Real backdrop blur on Android (liquid glass, matches web's
            // backdrop-blur). dimezisBlurView actually samples what's behind
            // the drawer; a translucent tint on top keeps white text legible.
            <>
              <BlurView
                intensity={65}
                tint="dark"
                experimentalBlurMethod="dimezisBlurView"
                style={StyleSheet.absoluteFill}
              />
              <View style={[StyleSheet.absoluteFill, styles.androidTint]} />
            </>
          )}
          <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 20,
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
                    label="Following"
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
                    label="Followers"
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
                    <Text className="text-white text-base font-semibold">Sign in</Text>
                    <Text className="text-neutral-400 text-sm">Tap to get started</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            <View className="py-2">
              {NAV_ITEMS.filter((item) => isSignedIn || !item.requiresAuth).map((item) => (
                <MenuItem
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
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
  },
  // Tint layered over the real Android blur — dark enough for legible white
  // text, translucent enough that the liquid-glass blur reads through.
  androidTint: {
    backgroundColor: "rgba(10, 10, 12, 0.35)",
  },
  glassOverlay: {
    backgroundColor: "rgba(10, 10, 12, 0.15)",
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
