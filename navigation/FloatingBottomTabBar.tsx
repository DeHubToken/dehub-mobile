import React, { memo, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Dimensions } from "react-native";
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
// The nav pill needs an untinted blur to match web's backdrop-filter, which
// expo-blur can't produce; see the BlurView usage in the pill below.
import { BlurView as GlassBlurView } from "@react-native-community/blur";
import { LinearGradient } from "expo-linear-gradient";
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

// Mirror the web nav pill (cosmic-echo-hero MobileBottomNav SCROLL_NAV_ITEMS):
// same icons and order, mapped to native screens where they exist and to the
// website for web-only pages. Web-only items with no mobile equivalent
// (Prompt, Stages, Command Centre, Staking) are omitted.
const SCROLL_NAV_ITEMS: ScrollNavItem[] = [
  { icon: "User", screen: ScreenNames.Profile },
  { icon: "Bell", screen: ScreenNames.Notifications },
  { icon: "CalendarDays", screen: ScreenNames.Events },
  { icon: "Wallet", screen: ScreenNames.Dpay },
  { icon: "ShieldCheck", screen: ScreenNames.Governance },
  { icon: "Trophy", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", screen: ScreenNames.MyLibrary },
  { icon: "Settings", screen: ScreenNames.AccountSettings },
  { icon: "Lightbulb", url: `${WEBSITE_LINK}/features` },
  { icon: "Map", screen: ScreenNames.Guide },
  { icon: "BookOpen", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", url: `${WEBSITE_LINK}/docs/blog` },
  { icon: "Briefcase", screen: ScreenNames.Careers },
  { icon: "Scroll", screen: ScreenNames.Glossary },
  { icon: "Users", screen: ScreenNames.Communities },
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
  badgeCount?: number;
}>(({ icon, isActive, isCenter, onPress, index, animProgress, badgeCount = 0 }) => {
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
          {/* Liquid-glass bubble — matches web's backdrop-blur(24px) create button.
              Real blur is iOS-only; Android keeps the translucent glass tint
              fallback (its experimental BlurView crashes on list mutation). */}
          {Platform.OS === "ios" && (
            <BlurView
              intensity={40}
              tint="light"
              style={styles.centerGlassBlur}
            />
          )}
          <View style={styles.centerGlass} />
          <Icon name={icon} size={20} color="#FFFFFF" strokeWidth={2} />
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
          size={20}
          color="#FFFFFF"
          strokeWidth={2}
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
        <Icon name={icon} size={20} color="#FFFFFF" strokeWidth={2} />
      </AnimatedPressable>
    );
  },
);

const FloatingBottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const user = useUser();
  const myUserId = ((user as any)?._id || (user as any)?.id) as string | undefined;
  const dmUnread = useTotalUnreadMessagesCount(myUserId);
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
      {/* Scrim under the floating pill. This was a bare View with no
          backgroundColor, so it rendered nothing at all. It matters most on
          Android, where the pill has no real blur: without it, sharp bright
          feed content scrolls right up to the pill's edge and breaks the
          illusion. It also seats the pill in the scene — the job Android
          elevation would normally do, which is deliberately refused here
          because elevation renders as a harsh dark slab on a translucent
          container (see navContainer below). */}
      <LinearGradient
        colors={["rgba(9,9,11,0)", "rgba(9,9,11,0.35)", "rgba(9,9,11,0.6)"]}
        style={styles.gradientOverlay}
        pointerEvents="none"
      />
      <Reanimated.View style={[styles.navContainer, entranceStyle]}>
        {/* Web is `backdrop-blur-2xl` (blur(40px) in our Tailwind config, not
            the stock 24px) with every bit of its colour coming from
            glassOverlay's zinc-900/10 — a strong blur under a near-transparent
            wash. expo-blur can't express that, as its `intensity` drives blur
            radius and tint alpha together, so the pill turns white before it
            turns glassy. Hence this library on iOS, where UIKit's materials are
            fixed-radius so the thinnest material is the least-tinted blur
            available.

            Android gets no real blur at all: the community BlurView is the
            Dimezis library underneath, whose PreDrawBlurController re-snapshots
            the root view every frame and throws IndexOutOfBoundsException when
            a list mutates children mid-draw (same crash FeedNavBar and
            AppDrawer already work around) — a permanently-mounted blur over an
            infinite feed makes that a matter of time. Translucent tint only.

            Upstream status (checked 2026-07-26): this is Dimezis/BlurView #191,
            closed for inactivity in 2023 with no code fix. It IS fixed in
            Dimezis 3.x — 3.0.0 replaced the per-frame root snapshot with a
            BlurTarget RenderNode on API 31+, and 3.1.0 guarded the pre-31
            software path — but neither library here ships it: expo-blur 15.0.7
            pins BlurView 2.0.6, @react-native-community/blur 4.4.1 pins 2.0.4.
            Forcing 3.x through Gradle does not work, since its API is not
            source-compatible with expo-blur 15's native code. The real fix
            arrives with Expo SDK 55 / expo-blur 55.0.0, which moves to BlurView
            3.1.0 and adds a blurTarget API for scoping the blur source to a
            stable subtree instead of the decorView. Until then this stands. */}
        {Platform.OS === "ios" ? (
          <GlassBlurView
            blurType="ultraThinMaterialLight"
            blurAmount={40}
            reducedTransparencyFallbackColor="#1c1c20"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          // Glass without blur: tint + a diagonal white sheen + inset
          // hairlines (GlassIndicator's recipe) to fake refraction depth.
          <>
            <View style={styles.androidBlurFallback} />
            {/* Web's glass has no white wash — its sheen comes from the blur
                itself — so keep this whisper-faint over the dark zinc tint.
                Graded top-to-bottom, not diagonally: a diagonal sheen reads as
                glossy plastic, whereas real blur output is vertically graded by
                the luminance behind it, and it darkens slightly at the bottom
                where the scrim sits. */}
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.07)",
                "rgba(255,255,255,0.015)",
                "rgba(0,0,0,0.05)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.androidInsetBottom} pointerEvents="none" />
          </>
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
    // Taller than the 52pt pill so the fade starts well above it and reads as
    // depth rather than as a band.
    height: 96,
  },
  navContainer: {
    width: "72%",
    maxWidth: 340,
    borderRadius: 16, // web's rounded-2xl
    overflow: "hidden",
    // No Android elevation: on a translucent container it renders as a harsh
    // dark slab that kills the glass look (see GlassIndicator's GLASS_SHADOW).
    // web's shadow-xl: 0 20px 25px -5px rgb(0 0 0 / .1). RN has no spread, so
    // the offset/radius are scaled down to compensate for the missing -5px.
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {},
    }),
  },
  androidBlurFallback: {
    ...StyleSheet.absoluteFillObject,
    // Stands in for the missing backdrop blur. Web's pill is zinc-900/10 over
    // blur(40) of the mostly dark app, which reads as dark smoky glass — so
    // the base tint is zinc-900 itself, translucent enough that content
    // ghosts through the way a blur would.
    backgroundColor: "rgba(24, 24, 27, 0.45)",
    borderRadius: 16,
  },
  androidInsetBottom: {
    position: "absolute",
    bottom: 1,
    left: 1,
    right: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Exactly web's bg-zinc-900/10 (zinc-900 is #18181b) + border-white/10.
    // The backdrop blur carries the glass; this is only a faint wash on top.
    backgroundColor: "rgba(24, 24, 27, 0.10)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  specularHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: NAV_EDGE_PAD,
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
    // Clip the BlurView bubble to the rounded corners.
    overflow: "hidden",
  },
  centerGlassBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  centerGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    // Match web: bg-white/18 + border-white/30 over the blur bubble.
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
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
  badge: {
    position: "absolute",
    top: 8,
    right: TAB_W / 2 - 18,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.35)",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 12,
  },
});

export default memo(FloatingBottomTabBar);
