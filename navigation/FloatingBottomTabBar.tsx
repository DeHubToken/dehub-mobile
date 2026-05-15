import React, { memo, useCallback, useEffect, useRef } from "react";
import { View, Pressable, ScrollView, StyleSheet, Platform, Dimensions } from "react-native";
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
import { useAuthState } from "../context/AuthContext";

const { width: SCREEN_W } = Dimensions.get("window");
const NAV_WIDTH = Math.min(SCREEN_W * 0.72, 340);
const CENTER_W = 52;
const TAB_W = (NAV_WIDTH - CENTER_W) / 4;

interface TabDef {
  name: string;
  icon: IconName;
  isCenter?: boolean;
}

const TABS: TabDef[] = [
  { name: ScreenNames.Home, icon: "House" },
  { name: ScreenNames.DM, icon: "MessageSquare" },
  { name: ScreenNames.UploadTab, icon: "Plus", isCenter: true },
  { name: ScreenNames.AIChat, icon: "Sparkles" },
  { name: ScreenNames.Explore, icon: "Search" },
];

interface ScrollNavItem {
  icon: IconName;
  screen?: string;
  url?: string;
}

const SCROLL_NAV_ITEMS: ScrollNavItem[] = [
  { icon: "User", screen: ScreenNames.Profile },
  { icon: "Bell", screen: ScreenNames.Notifications },
  { icon: "Trophy", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", screen: ScreenNames.MyLibrary },
  { icon: "Banknote", screen: ScreenNames.Dpay },
  { icon: "Settings", screen: ScreenNames.AccountSettings },
  { icon: "BookOpen", url: `${WEBSITE_LINK}/docs` },
  { icon: "Lightbulb", url: `${WEBSITE_LINK}/features` },
  { icon: "ShieldCheck", url: `${WEBSITE_LINK}/governance` },
  { icon: "Briefcase", url: `${WEBSITE_LINK}/app/jobs` },
];

const AUTHED_ONLY_SCREENS = new Set([
  ScreenNames.Profile,
  ScreenNames.Notifications,
  ScreenNames.MyLibrary,
  ScreenNames.Dpay,
  ScreenNames.AccountSettings,
]);

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

const NavButton = memo<{
  icon: IconName;
  isActive: boolean;
  isCenter?: boolean;
  onPress: () => void;
  index: number;
  animProgress: SharedValue<number>;
}>(({ icon, isActive, isCenter, onPress, index, animProgress }) => {
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
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.centerButton, animatedStyle]}
      >
        <View style={styles.centerIconWrap}>
          <View style={styles.centerGlass} />
          <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={2} />
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.tabButton, animatedStyle]}
    >
      <View style={isActive ? styles.activeGlow : undefined}>
        <Icon
          name={icon}
          size={22}
          color="#FFFFFF"
          strokeWidth={isActive ? 2.2 : 1.6}
        />
      </View>
    </AnimatedPressable>
  );
});

const ScrollNavButton = memo<{ icon: IconName; onPress: () => void }>(
  ({ icon, onPress }) => {
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
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.scrollNavItem, animatedStyle]}
      >
        <Icon name={icon} size={22} color="#FFFFFF" strokeWidth={1.6} />
      </AnimatedPressable>
    );
  },
);

const FloatingBottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const animProgress = useSharedValue(1);
  const containerAnim = useSharedValue(0);
  const hasAnimated = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const entranceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(containerAnim.value, [0, 1], [50, 0], "clamp") }],
    opacity: interpolate(containerAnim.value, [0, 0.3, 1], [0, 0.7, 1], "clamp"),
  }));

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    animProgress.value = 0;
    containerAnim.value = 0;
    containerAnim.value = withDelay(30, withSpring(1, { damping: 18, stiffness: 80, mass: 0.8 }));
    animProgress.value = withDelay(
      100,
      withTiming(1, { duration: 700, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
    );
    const hintTimer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: 60, animated: true });
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: 0, animated: true });
      }, 600);
    }, 1500);
    return () => clearTimeout(hintTimer);
  }, [animProgress, containerAnim]);

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

  const hideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabSlide.value * TAB_BAR_SLIDE }],
    opacity: interpolate(tabSlide.value, [0, 0.5], [1, 0], "clamp"),
  }));

  return (
    <Reanimated.View style={[styles.outerWrap, { paddingBottom: bottomPadding }, hideStyle]} pointerEvents="box-none">
      <View style={styles.gradientOverlay} pointerEvents="none" />
      <Reanimated.View style={[styles.navContainer, entranceStyle]}>
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={120}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.androidBlurFallback} />
        )}
        <View style={styles.glassOverlay} />
        <View style={styles.specularHighlight} />
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
                isActive={isActive}
                isCenter={tab.isCenter}
                onPress={() => handlePress(tab.name)}
                index={index}
                animProgress={animProgress}
              />
            );
          })}
          {SCROLL_NAV_ITEMS
            .filter((item) => isAuthed || !item.screen || !AUTHED_ONLY_SCREENS.has(item.screen as any))
            .map((item) => (
            <ScrollNavButton
              key={item.screen ?? item.url}
              icon={item.icon}
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
  gradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  navContainer: {
    width: "72%",
    maxWidth: 340,
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  androidBlurFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 12, 0.85)",
    borderRadius: 18,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 10, 12, 0.30)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  specularHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
  },
  tabButton: {
    width: TAB_W,
    alignItems: "center",
    justifyContent: "center",
    height: 52,
  },
  centerButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  centerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  centerGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  activeGlow: {
    ...Platform.select({
      ios: {
        shadowColor: "#FFFFFF",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 12,
      },
      android: {},
    }),
  },
  scrollNavItem: {
    width: TAB_W,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    height: 52,
  },
});

export default memo(FloatingBottomTabBar);
