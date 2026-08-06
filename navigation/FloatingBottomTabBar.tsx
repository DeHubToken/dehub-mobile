import React, { memo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
  InteractionManager,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Icon from "../components/ui/Icon";
import type { IconName } from "../components/ui/Icon";
import { ScreenNames } from "./ScreenNames";
import { WEBSITE_LINK } from "../config/links";
import { openInApp } from "../libs/links.utils";
import { useTabBarHide } from "../context/TabBarHideContext";
import { useAuthState, useUser } from "../context/AuthContext";
import { useTotalUnreadMessagesCount } from "../store/dm.store";
import { storage } from "../libs/storage";
import { TAB_BAR_PILL_HEIGHT } from "./tabBarLayout";
import { useTranslation } from "react-i18next";

const SCROLL_HINT_SEEN_KEY = "dehub:navScrollHintSeen";

// Web nav: bg-zinc-900/10 backdrop-blur-2xl border-white/10 — neutral blur with
// only a 10% zinc wash. No white frost/sheen on the pill itself.
const PILL_BLUR_PROPS =
  Platform.OS === "ios"
    ? ({ tint: "systemThinMaterialLight", intensity: 30 } as const)
    : ({
        tint: "default",
        intensity: 22,
        experimentalBlurMethod: "dimezisBlurView",
      } as const);

const { width: SCREEN_W } = Dimensions.get("window");
// Container is 72% of the screen minus outerWrap's 16px horizontal padding —
// compute tab widths from the same base so the last tab (Search) isn't pushed
// past the visible edge.
const NAV_WIDTH = Math.min((SCREEN_W - 16) * 0.72, 340);
const CENTER_W = 52;
const NAV_EDGE_PAD = 4; // matches web's pl-1/pr-1
const TAB_W = (NAV_WIDTH - CENTER_W - NAV_EDGE_PAD * 2) / 4;

interface TabDef {
  name: string;
  icon: IconName;
  labelKey: string;
  isCenter?: boolean;
}

const TABS: TabDef[] = [
  { name: ScreenNames.Home, icon: "House", labelKey: "nav.home" },
  { name: ScreenNames.DM, icon: "MessageSquare", labelKey: "nav.messages" },
  { name: ScreenNames.UploadTab, icon: "Plus", labelKey: "nav.create", isCenter: true },
  { name: ScreenNames.AIChat, icon: "Sparkles", labelKey: "nav.assistant" },
  { name: ScreenNames.Explore, icon: "Search", labelKey: "nav.explore" },
];

interface ScrollNavItem {
  icon: IconName;
  labelKey: string;
  screen?: string;
  url?: string;
}

// Mirror the web nav pill: same icons and order, mapped to native screens
// where they exist and to the website for web-only pages.
const SCROLL_NAV_ITEMS: ScrollNavItem[] = [
  { icon: "User", labelKey: "nav.profile", screen: ScreenNames.Profile },
  { icon: "Bell", labelKey: "nav.notifications", screen: ScreenNames.Notifications },
  { icon: "Wand", labelKey: "nav.prompt", screen: ScreenNames.Prompt },
  { icon: "CalendarDays", labelKey: "nav.events", screen: ScreenNames.Events },
  { icon: "LayoutDashboard", labelKey: "nav.commandCentre", screen: ScreenNames.CommandCentre },
  { icon: "Wallet", labelKey: "nav.wallet", screen: ScreenNames.Dpay },
  { icon: "ShieldCheck", labelKey: "nav.governance", screen: ScreenNames.Governance },
  { icon: "Trophy", labelKey: "nav.leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", labelKey: "nav.bookmarks", screen: ScreenNames.MyLibrary },
  { icon: "Settings", labelKey: "nav.settings", screen: ScreenNames.AccountSettings },
  { icon: "Lightbulb", labelKey: "nav.featureRequests", url: `${WEBSITE_LINK}/features` },
  { icon: "Map", labelKey: "nav.guide", screen: ScreenNames.Guide },
  { icon: "BookOpen", labelKey: "nav.docs", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", labelKey: "nav.blog", url: `${WEBSITE_LINK}/docs/blog` },
  { icon: "Briefcase", labelKey: "nav.careers", screen: ScreenNames.Careers },
  { icon: "Scroll", labelKey: "nav.glossary", screen: ScreenNames.Glossary },
  { icon: "Users", labelKey: "nav.communities", screen: ScreenNames.Communities },
];

const AUTHED_ONLY_SCREENS = new Set([
  ScreenNames.Profile,
  ScreenNames.Notifications,
  ScreenNames.MyLibrary,
  ScreenNames.Dpay,
  ScreenNames.CommandCentre,
  ScreenNames.AccountSettings,
]);

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

const NavButton = memo<{
  icon: IconName;
  label: string;
  isActive: boolean;
  isCenter?: boolean;
  onPress: () => void;
  index: number;
  animProgress: SharedValue<number>;
  badgeCount?: number;
}>(({ icon, label, isActive, isCenter, onPress, index, animProgress, badgeCount = 0 }) => {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.88, { damping: 15, stiffness: 300 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    const staggerDelay = index * 0.07;
    const itemProgress = interpolate(
      animProgress.value,
      [staggerDelay, staggerDelay + 0.6],
      [0, 1],
      "clamp",
    );
    return {
      transform: [
        { scale: scale.value * interpolate(itemProgress, [0, 1], [0.5, 1], "clamp") },
        { translateY: interpolate(itemProgress, [0, 1], [10, 0], "clamp") },
      ],
      opacity: interpolate(itemProgress, [0, 0.35, 1], [0, 0.85, 1], "clamp"),
    };
  });

  if (isCenter) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.centerButton, animatedStyle]}
      >
        <View style={styles.centerIconWrap}>
          {/* Web: bg-white/18 + backdrop-blur(24px) + border-white/30 +
              inset_0_1px_1px white/20 + 0_2px_8px black/30 */}
          {Platform.OS === "ios" ? (
            <BlurView
              intensity={24}
              tint="light"
              style={styles.centerGlassBlur}
            />
          ) : (
            <BlurView
              intensity={24}
              tint="light"
              experimentalBlurMethod="dimezisBlurView"
              style={styles.centerGlassBlur}
            />
          )}
          <View style={styles.centerGlass} />
          <View style={styles.centerGlassInsetTop} pointerEvents="none" />
          <Icon name={icon} size={20} color="#FFFFFF" strokeWidth={2} />
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.tabButton, animatedStyle]}
    >
      <View style={isActive ? styles.activeGlow : undefined}>
        <Icon
          name={icon}
          size={20}
          color={isActive ? "#FFFFFF" : "rgba(255, 255, 255, 0.72)"}
          strokeWidth={isActive ? 2 : 1.75}
        />
      </View>
      {badgeCount > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText} numberOfLines={1}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
});

const ScrollNavButton = memo<{ icon: IconName; label: string; onPress: () => void }>(
  ({ icon, label, onPress }) => {
    const scale = useSharedValue(1);

    const handlePressIn = useCallback(() => {
      scale.value = withSpring(0.88, { damping: 15, stiffness: 300 });
    }, [scale]);

    const handlePressOut = useCallback(() => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    }, [scale]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.scrollNavItem, animatedStyle]}
      >
        <Icon name={icon} size={20} color="rgba(255, 255, 255, 0.72)" strokeWidth={1.75} />
      </AnimatedPressable>
    );
  },
);

const FloatingBottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const user = useUser();
  const myUserId = ((user as any)?._id || (user as any)?.id) as string | undefined;
  const dmUnread = useTotalUnreadMessagesCount(myUserId);
  const animProgress = useSharedValue(1);
  const containerAnim = useSharedValue(0);
  const entranceFade = useSharedValue(0);
  const hasAnimated = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // UIKit refuses to render a visual-effect view correctly when it or any
  // superview has an alpha below 1 — Apple documents this explicitly. The
  // entrance fade therefore rides its own withTiming value, which lands exactly
  // on 1, rather than the spring below: a spring settles asymptotically, so it
  // parked this container at ~0.9995 forever and quietly degraded the pill's
  // blur for the rest of the session.
  const entranceStyle = useAnimatedStyle(() => {
    const o = entranceFade.value;
    return {
      transform: [{ translateY: interpolate(containerAnim.value, [0, 1], [50, 0], "clamp") }],
      opacity: o > 0.999 ? 1 : o,
    };
  });

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    animProgress.value = 0;
    containerAnim.value = 0;
    entranceFade.value = 0;
    containerAnim.value = withDelay(30, withSpring(1, { damping: 18, stiffness: 80, mass: 0.8 }));
    entranceFade.value = withDelay(30, withTiming(1, { duration: 320 }));
    animProgress.value = withDelay(
      100,
      withTiming(1, { duration: 700, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
    );
  }, [animProgress, containerAnim, entranceFade]);

  // Nudge the nav pill sideways once, ever, to show it scrolls. It used to fire
  // on a 1500ms timer every single launch — a JS-driven ScrollView animation
  // landing squarely in the user's first interaction with the app.
  useEffect(() => {
    if (storage.getBoolean(SCROLL_HINT_SEEN_KEY)) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      storage.set(SCROLL_HINT_SEEN_KEY, true);
      scrollRef.current?.scrollTo({ x: 60, animated: true });
      timers.push(
        setTimeout(() => {
          if (!cancelled) scrollRef.current?.scrollTo({ x: 0, animated: true });
        }, 600),
      );
    });
    return () => {
      cancelled = true;
      task.cancel();
      timers.forEach(clearTimeout);
    };
  }, []);

  const handlePress = useCallback(
    (routeName: string) => {
      const route = state.routes.find((r) => r.name === routeName);
      const event = navigation.emit({
        type: "tabPress",
        target: route?.key ?? routeName,
        canPreventDefault: true,
      });

      if (!event.defaultPrevented) {
        const isFocused = state.routes[state.index]?.name === routeName;
        if (!isFocused) {
          navigation.navigate(routeName);
        }
      }
    },
    [navigation, state],
  );

  const handleScrollItemPress = useCallback(
    (item: ScrollNavItem) => {
      if (item.url) {
        openInApp(item.url);
      } else if (item.screen) {
        navigation.navigate(item.screen as never);
      }
    },
    [navigation],
  );

  const bottomPadding = Math.max(Platform.OS === "android" ? 6 : 2, insets.bottom - 22);
  const TAB_BAR_SLIDE = 110; // distance to push off-screen (matches web's 110%)

  // Mirror header hide: slide tab bar down when header hides.
  // Uses its own shared value with independent timing so the tab bar
  // animates smoothly instead of snapping frame-by-frame with the header.
  const headerTranslateY = useTabBarHide();
  const tabSlide = useSharedValue(0);

  useAnimatedReaction(
    () => headerTranslateY?.value ?? 0,
    (val) => {
      // Hide when header has scrolled past ~30% of a typical header
      const target = val < -55 ? 1 : 0;
      tabSlide.value = withTiming(target, {
        duration: 350,
        easing: Easing.bezier(0.25, 1, 0.5, 1),
      });
    },
    [headerTranslateY],
  );

  const hideStyle = useAnimatedStyle(() => {
    // Snapped to exactly 1 at rest for the same reason as entranceStyle: this
    // view is a superview of the pill's UIVisualEffectView, and any alpha below
    // 1 anywhere above it kills the blur.
    const o = interpolate(tabSlide.value, [0, 0.5], [1, 0], "clamp");
    return {
      transform: [{ translateY: tabSlide.value * TAB_BAR_SLIDE }],
      opacity: o > 0.999 ? 1 : o,
    };
  });

  return (
    <Reanimated.View style={[styles.outerWrap, { paddingBottom: bottomPadding }, hideStyle]} pointerEvents="box-none">
      <Reanimated.View style={[styles.navContainer, entranceStyle]}>
        {/* Web: bg-zinc-900/10 backdrop-blur-2xl border-white/10 — blur + wash only */}
        <BlurView {...PILL_BLUR_PROPS} style={StyleSheet.absoluteFill} />
        <View style={styles.glassOverlay} />
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.navRow}
        >
          {TABS.map((tab, index) => {
            const isActive = state.routes[state.index]?.name === tab.name;
            return (
              <NavButton
                key={tab.name}
                icon={tab.icon}
                label={t(tab.labelKey)}
                isActive={isActive}
                isCenter={tab.isCenter}
                onPress={() => handlePress(tab.name)}
                index={index}
                animProgress={animProgress}
                badgeCount={tab.name === ScreenNames.DM && isAuthed ? dmUnread : 0}
              />
            );
          })}
          {SCROLL_NAV_ITEMS
            .filter((item) => isAuthed || !item.screen || !AUTHED_ONLY_SCREENS.has(item.screen as any))
            .map((item) => (
            <ScrollNavButton
              key={item.screen ?? item.url}
              icon={item.icon}
              label={t(item.labelKey)}
              onPress={() => handleScrollItemPress(item)}
            />
          ))}
        </ScrollView>
      </Reanimated.View>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  outerWrap: {
    position: "absolute",
    bottom: -12,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  navContainer: {
    width: "72%",
    maxWidth: 340,
    borderRadius: 16, // web's rounded-2xl on the pill (not rounded-xl — that's the center button only)
    overflow: "hidden",
    // No Android elevation: on a translucent container it renders as a harsh
    // dark slab that kills the glass look (see GlassIndicator's GLASS_SHADOW).
    // web shadow-xl: 0 20px 25px -5px rgb(0 0 0 / .1), 0 8px 10px -6px rgb(0 0 0 / .1)
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: {},
    }),
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    // bg-zinc-900/10 + border-white/10 — exactly web's nav classes
    backgroundColor: "rgba(24, 24, 27, 0.09)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    height: TAB_BAR_PILL_HEIGHT,
    paddingHorizontal: NAV_EDGE_PAD,
  },
  tabButton: {
    width: TAB_W,
    alignItems: "center",
    justifyContent: "center",
    height: TAB_BAR_PILL_HEIGHT,
  },
  centerButton: {
    width: TAB_BAR_PILL_HEIGHT,
    height: TAB_BAR_PILL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  centerIconWrap: {
    // Web: w-9 h-9 rounded-xl inside a w-12 h-12 tap target.
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  centerGlassBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  centerGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
  },
  centerGlassInsetTop: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.20)",
  },
  activeGlow: {
    // Web: drop-shadow only on the active icon — inactive tabs stay flat/dim.
    ...Platform.select({
      ios: {
        shadowColor: "#FFFFFF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 8,
      },
      android: {
        // RN shadow needs a non-transparent backdrop on Android; a hairline
        // fill lets the white halo render only on the active tab wrapper.
        backgroundColor: "rgba(255, 255, 255, 0.01)",
        shadowColor: "#FFFFFF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 6,
        elevation: 0,
      },
    }),
  },
  scrollNavItem: {
    width: TAB_W,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    height: TAB_BAR_PILL_HEIGHT,
  },
  badge: {
    position: "absolute",
    top: 8,
    right: TAB_W / 2 - 18,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.35)",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
  },
});

export default memo(FloatingBottomTabBar);
