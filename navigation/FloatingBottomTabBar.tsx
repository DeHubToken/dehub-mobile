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
// The nav pill needs a dark, low-tint backdrop blur that expo-blur can't
// express — its `intensity` drives blur radius and tint alpha together, so the
// pill turns white before it turns glassy. See the pill's BlurView below.
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
// Imperative opener rather than `useStages()` — see the note on the export.
import { openStageModal } from "../context/StageContext";
import { useAuthState, useUser } from "../context/AuthContext";
import { useTotalUnreadMessagesCount } from "../store/dm.store";
import { storage } from "../libs/storage";
import { bootRevealed } from "../libs/bootReveal";
import { TAB_BAR_PILL_HEIGHT, TAB_BAR_SCRIM_HEIGHT } from "./tabBarLayout";
import { useTranslation } from "react-i18next";

const SCROLL_HINT_SEEN_KEY = "dehub:navScrollHintSeen";

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
  params?: Record<string, unknown>;
  url?: string;
  /**
   * Feature presented as a global modal rather than a route — same escape
   * hatch AppDrawer uses, because this list is module-level and cannot hold
   * hook-derived callbacks.
   */
  action?: "stages";
}

// Mirror the web nav pill (MobileBottomNav's SCROLL_NAV_ITEMS): same icons and
// order, mapped to native screens where they exist and to the website for
// web-only pages. Everything after Communities has no web nav-pill counterpart
// and follows the drawer's order instead, so every destination in the drawer is
// also reachable from here.
const SCROLL_NAV_ITEMS: ScrollNavItem[] = [
  { icon: "User", labelKey: "nav.profile", screen: ScreenNames.Profile },
  { icon: "Bell", labelKey: "nav.notifications", screen: ScreenNames.Notifications },
  { icon: "Wand", labelKey: "nav.prompt", screen: ScreenNames.Prompt },
  { icon: "CalendarDays", labelKey: "nav.events", screen: ScreenNames.Events },
  // Stages is modal-based on native (StagesModalsHost is mounted app-wide in
  // App.tsx), so it opens the browse modal instead of navigating to a route.
  { icon: "Mic", labelKey: "nav.stages", action: "stages" },
  { icon: "LayoutDashboard", labelKey: "nav.commandCentre", screen: ScreenNames.CommandCentre },
  // Wallet and Staking are the same screen on native, split by tab — hence the
  // explicit initialTab on both, so arriving from one never inherits the
  // other's tab.
  { icon: "Wallet", labelKey: "nav.wallet", screen: ScreenNames.Dpay, params: { initialTab: "buy" } },
  { icon: "Vault", labelKey: "nav.staking", screen: ScreenNames.Dpay, params: { initialTab: "stake" } },
  { icon: "ShieldCheck", labelKey: "nav.governance", screen: ScreenNames.Governance },
  { icon: "Trophy", labelKey: "nav.leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", labelKey: "nav.bookmarks", screen: ScreenNames.MyLibrary },
  { icon: "Settings", labelKey: "nav.settings", screen: ScreenNames.AccountSettings },
  // Native screen, not the website — the drawer has routed here for a while.
  { icon: "Lightbulb", labelKey: "nav.featureRequests", screen: ScreenNames.FeatureRequests },
  { icon: "Map", labelKey: "nav.guide", screen: ScreenNames.Guide },
  { icon: "BookOpen", labelKey: "nav.docs", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", labelKey: "nav.blog", url: `${WEBSITE_LINK}/docs/blog` },
  { icon: "Briefcase", labelKey: "nav.careers", screen: ScreenNames.Careers },
  { icon: "Scroll", labelKey: "nav.glossary", screen: ScreenNames.Glossary },
  { icon: "Gamepad2", labelKey: "nav.arcade", screen: ScreenNames.Arcade },
  { icon: "Users", labelKey: "nav.communities", screen: ScreenNames.Communities },
  // Drawer-only tail. Web's sidebar reuses Briefcase for both Bounties and
  // Careers and Users for both Communities and Affiliate; it can afford to,
  // because it draws a label beside every icon. This bar is icons only, so
  // the second of each pair takes a distinct glyph.
  { icon: "Tv", labelKey: "nav.tv", screen: ScreenNames.TV },
  { icon: "Store", labelKey: "screens.stores", screen: ScreenNames.Stores },
  { icon: "AtSign", labelKey: "screens.usernames", screen: ScreenNames.Usernames },
  { icon: "IdCard", labelKey: "screens.accounts", screen: ScreenNames.Accounts },
  { icon: "Hammer", labelKey: "screens.work", screen: ScreenNames.Work },
  { icon: "Handshake", labelKey: "nav.affiliate", screen: ScreenNames.Affiliate },
  { icon: "Megaphone", labelKey: "nav.ads", screen: ScreenNames.Ads },
];

const AUTHED_ONLY_SCREENS = new Set([
  ScreenNames.Profile,
  ScreenNames.Notifications,
  ScreenNames.MyLibrary,
  ScreenNames.Dpay,
  ScreenNames.CommandCentre,
  ScreenNames.AccountSettings,
  ScreenNames.Affiliate,
  ScreenNames.Ads,
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
          <BlurView
            intensity={24}
            tint="light"
            {...(Platform.OS === "android"
              ? { experimentalBlurMethod: "dimezisBlurView" as const }
              : {})}
            style={styles.centerGlassBlur}
          />
          <View style={styles.centerGlass} />
          <View style={styles.centerGlassInsetTop} pointerEvents="none" />
          <Icon name={icon} size={20} color="#FFFFFF" strokeWidth={2} />
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      // Which tab you are on is conveyed purely by icon colour and a glow, and
      // the unread count purely by a red badge — neither reaches a screen
      // reader on its own. `selected` handles the first; the count is folded
      // into the label because a sibling Text inside a labelled Pressable is
      // not announced.
      accessibilityLabel={badgeCount > 0 ? `${label}, ${badgeCount} unread` : label}
      accessibilityState={{ selected: isActive }}
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

const ScrollNavButton = memo<{ icon: IconName; label: string; onPress: () => void; badgeCount?: number }>(
  ({ icon, label, onPress, badgeCount = 0 }) => {
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
        accessibilityLabel={badgeCount > 0 ? `${label}, ${badgeCount} unread` : label}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.scrollNavItem, animatedStyle]}
      >
        <Icon name={icon} size={20} color="rgba(255, 255, 255, 0.72)" strokeWidth={1.75} />
        {badgeCount > 0 && (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText} numberOfLines={1}>
              {badgeCount > 99 ? "99+" : badgeCount}
            </Text>
          </View>
        )}
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
  // Resting state by default: a mount that happens underneath the boot
  // preloader (every cold start) must appear settled, or the user catches the
  // tail of this choreography as movement right on top of the reveal. The
  // first mount after the curtain has lifted — auth replace, sign-out/in —
  // plays it once.
  const animProgress = useSharedValue(1);
  const containerAnim = useSharedValue(1);
  const entranceFade = useSharedValue(1);
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
    if (hasAnimated.current || !bootRevealed) return;
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
      if (item.action === "stages") {
        openStageModal("browse");
      } else if (item.url) {
        openInApp(item.url);
      } else if (item.screen) {
        // Cast the function, not the arguments: `navigate(x as never, y as never)`
        // does not typecheck, because `never` collapses the two-arg overload.
        // Most of these routes are not in this navigator's param list at all —
        // they bubble up to the root stack — so the call is untypeable either
        // way and the cast belongs at the boundary.
        (navigation.navigate as (screen: string, params?: Record<string, unknown>) => void)(
          item.screen,
          item.params,
        );
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
  // Last target handed to withTiming. The reaction below runs on every frame of
  // the header's own 380ms animation, and it used to call withTiming on each of
  // them — roughly 23 fresh 350ms animations, each resetting the previous one's
  // start time and start value. tabSlide therefore never got to run a clean
  // curve; it crawled and rubber-banded. Only a genuine change of destination
  // should start an animation.
  const tabSlideTarget = useSharedValue(0);

  useAnimatedReaction(
    () => headerTranslateY?.value ?? 0,
    (val) => {
      // Hide when header has scrolled past ~30% of a typical header
      const target = val < -55 ? 1 : 0;
      if (target === tabSlideTarget.value) return;
      tabSlideTarget.value = target;
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
      {/* Scrim under the floating pill, and the reason the pill can afford to
          stay near-transparent at all.

          The pill borrows its entire appearance from whatever is behind it, so
          its apparent opacity is a function of the backdrop's luminance. That
          is fine everywhere the app is dark-dominant — the top nav pill sits on
          headerClip's opaque #010305 — but the Shorts grid is the one surface
          that puts full-bleed, edge-to-edge, autoplaying video across the whole
          width, and against that the pill read as clear glass with icons
          floating on video. This scrim is the luminance floor that stops that.

          `locations` matter as much as the colours: the ramp is anchored to
          outerWrap's bottom, which hangs 12px below the screen edge, so an even
          three-stop ramp wasted its darkest 12px off-screen and only reached
          ~0.3-0.5 across the band the pill actually occupies. Peak now lands at
          0.42 — just as the pill starts — and holds flat to the bottom. */}
      <LinearGradient
        colors={[
          "rgba(9,9,11,0)",
          "rgba(9,9,11,0.42)",
          "rgba(9,9,11,0.75)",
          "rgba(9,9,11,0.75)",
        ]}
        locations={[0, 0.28, 0.42, 1]}
        style={styles.gradientOverlay}
        pointerEvents="none"
      />
      <Reanimated.View style={[styles.navContainer, entranceStyle]}>
        {/* Web is `backdrop-blur-2xl` (blur(40px) in our Tailwind config) with
            every bit of its colour coming from glassOverlay's zinc wash — a
            strong blur under a near-transparent tint. expo-blur can't express
            that: its `intensity` drives blur radius and tint alpha together, so
            the pill turns white before it turns glassy. Hence this library on
            iOS, whose UIKit materials let the radius and the tint be chosen
            separately.

            `thinMaterialDark`, not `ultraThinMaterialDark` and emphatically not
            a *Light* material. Light takes essentially all its colour from what
            is behind it, which survives the mostly-dark feed and falls apart on
            Shorts. UltraThin is the least-tinted material UIKit ships, which is
            the same failure one notch quieter. Thin is the same family with
            enough tint left to hold one identity over any backdrop. blurAmount
            still applies here — BlurEffectWithAmount injects it as `blurRadius`
            into the effect settings, materials included.

            Android does get real blur, via expo-blur's `dimezisBlurView`. That
            is the Dimezis library, whose PreDrawBlurController re-snapshots the
            root view every frame — the reason FeedNavBar, GlassToast and
            FeedScreen all refuse it (Dimezis/BlurView #191, an
            IndexOutOfBoundsException when a list mutates children mid-draw).
            It is enabled here anyway and deliberately: a flat tint on this
            surface reads as no glass at all, which is a certain regression
            traded against a possible crash. If #191 does start showing up in
            the wild, this is the first thing to switch back to `'none'`. */}
        {Platform.OS === "ios" ? (
          <GlassBlurView
            blurType="thinMaterialDark"
            blurAmount={40}
            reducedTransparencyFallbackColor="#1c1c20"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <BlurView
            tint="default"
            intensity={22}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        )}
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
              // Not the screen name: Wallet and Staking are both Dpay.
              key={item.labelKey}
              icon={item.icon}
              label={t(item.labelKey)}
              onPress={() => handleScrollItemPress(item)}
              badgeCount={
                item.screen === ScreenNames.Notifications && isAuthed
                  ? user?.notificationCount ?? 0
                  : 0
              }
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
    // Taller than the pill so the fade starts well above it and reads as depth
    // rather than as a band.
    height: TAB_BAR_SCRIM_HEIGHT,
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
    // Web's bg-zinc-900/10 exactly. It was briefly pushed to 0.16 as a second
    // luminance floor for the Shorts tab, but with a real blur on both
    // platforms the scrim behind the pill already darkens what the blur
    // samples, and a heavier wash here only mutes the blur it sits on.
    backgroundColor: "rgba(24, 24, 27, 0.10)",
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
