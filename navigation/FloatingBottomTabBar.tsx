import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated as NativeAnimated,
  Easing as NativeEasing,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  InteractionManager,
  useWindowDimensions,
  Image,
  type ViewStyle,
} from "react-native";
import { GRAIN } from "../theme/skins";
import HudBrackets from "../components/theme/HudBrackets";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
} from "react-native-reanimated";
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
import { bootRevealed } from "../libs/bootReveal";
import { TAB_BAR_PILL_HEIGHT } from "./tabBarLayout";
import type { TabPressIntent } from "./tabPressIntent";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../context/ThemeContext";
import { useKidsMode } from "../hooks/useKidsMode";
import StageMiniPlayer from "../components/Stages/StageMiniPlayer";
import { useStages } from "../context/StageContext";
import {
  MINIMAL_HAIRLINE,
  MINIMAL_TAB_LINE,
  MINIMAL_TAB_TEXT,
  MINIMAL_TAB_TEXT_ACTIVE,
} from "../theme/minimal";

const SCROLL_HINT_SEEN_KEY = "dehub:navScrollHintSeen";

const CENTER_W = 52;
const NAV_EDGE_PAD = 4; // matches web's pl-1/pr-1

/**
 * The container is 72% of the screen minus outerWrap's 16px horizontal
 * padding; tab widths come off the same base so the last tab (Search) is not
 * pushed past the visible edge.
 *
 * A function of the live window width, deliberately, rather than a module
 * constant off `Dimensions.get("window")`. Read once at module scope it froze
 * at whatever the window measured when the bundle was first evaluated — so
 * rotating the phone, unfolding a foldable or entering split-screen left the
 * pill laid out for the old width, with items past the edge and unread badges
 * sitting off their icons.
 */
const tabWidthFor = (screenW: number) =>
  (Math.min((screenW - 16) * 0.72, 340) - CENTER_W - NAV_EDGE_PAD * 2) / 4;

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
  { icon: "Mic", labelKey: "nav.stages", screen: ScreenNames.Stages },
  { icon: "LayoutDashboard", labelKey: "nav.commandCentre", screen: ScreenNames.CommandCentre },
  // Wallet and Staking are the same screen on native, split by tab — hence the
  // explicit initialTab on both, so arriving from one never inherits the
  // other's tab.
  { icon: "Wallet", labelKey: "nav.wallet", screen: ScreenNames.Dpay, params: { initialTab: "buy" } },
  { icon: "Vault", labelKey: "nav.staking", screen: ScreenNames.Dpay, params: { initialTab: "stake" } },
  { icon: "ShieldCheck", labelKey: "nav.governance", screen: ScreenNames.Governance },
  { icon: "Landmark", labelKey: "nav.dao", screen: ScreenNames.Dao },
  { icon: "Trophy", labelKey: "nav.leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "Bookmark", labelKey: "nav.bookmarks", screen: ScreenNames.MyLibrary },
  { icon: "Settings", labelKey: "nav.settings", screen: ScreenNames.AccountSettings },
  // Native screen, not the website — the drawer has routed here for a while.
  { icon: "Lightbulb", labelKey: "nav.featureRequests", screen: ScreenNames.FeatureRequests },
  { icon: "Map", labelKey: "nav.guide", screen: ScreenNames.Guide },
  { icon: "Plug", labelKey: "nav.connectAi", screen: ScreenNames.Connect },
  { icon: "BookOpen", labelKey: "nav.docs", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", labelKey: "nav.blog", url: `${WEBSITE_LINK}/docs/blog` },
  { icon: "Briefcase", labelKey: "nav.careers", screen: ScreenNames.Careers },
  { icon: "Star", labelKey: "nav.creators", screen: ScreenNames.Creators },
  { icon: "ArrowDownToLine", labelKey: "nav.converter", screen: ScreenNames.Converter },
  // The converter's batch twin. Sits next to it because a creator who finds
  // one wants the other: one link, or the whole back catalogue.
  { icon: "FolderInput", labelKey: "nav.migrate", screen: ScreenNames.Migrate },
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
  { icon: "ChartPie", labelKey: "nav.fractions", screen: ScreenNames.Fractions },
  { icon: "IdCard", labelKey: "screens.accounts", screen: ScreenNames.Accounts },
  { icon: "Hammer", labelKey: "screens.work", screen: ScreenNames.Work },
  { icon: "Handshake", labelKey: "nav.affiliate", screen: ScreenNames.Affiliate },
  { icon: "Megaphone", labelKey: "nav.ads", screen: ScreenNames.Ads },
];

// DHB-unlock surfaces the App Store build leaves out — see config/storefront.
const STOREFRONT_HIDDEN_SCREENS = new Set([
  ScreenNames.Ads,
  ScreenNames.SuperPowers,
  ScreenNames.Dpay,
  ScreenNames.CommandCentre,
  ScreenNames.Arcade,
  ScreenNames.ArcadeGame,
  ScreenNames.ArcadeChessOnline,
  ScreenNames.Stores,
  ScreenNames.StoreDetail,
  ScreenNames.ListingDetail,
  ScreenNames.Usernames,
  ScreenNames.Fractions,
  ScreenNames.Accounts,
  ScreenNames.Work,
  ScreenNames.WorkJobDetail,
  ScreenNames.WorkPost,
  ScreenNames.WorkEdit,
  ScreenNames.WorkHistory,
  ScreenNames.WorkDisputes,
  ScreenNames.Affiliate,
  ScreenNames.Governance,
  ScreenNames.Dao,
  ScreenNames.Earnings,
]);

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

/**
 * The only destinations reachable in Kids Mode.
 *
 * An allowlist, not a denylist, and for the same reason web's is: this bar and
 * the drawer behind it carry thirty-odd screens and grow most weeks, so a list
 * of what is forbidden would be wrong the day somebody adds the next one — and
 * wrong in the direction that matters.
 *
 * Settings stays because it is the way out; the panel there hides everything on
 * it except the PIN pad. Everything else is absent: messages and stages are
 * direct contact with adults, the wallet and dpay spend the parent's money,
 * notifications and profiles are doors to whatever an account ever posted, and
 * the assistant answers with text nobody rated.
 */
const KIDS_MODE_SCREENS = new Set([
  ScreenNames.Home,
  ScreenNames.AccountSettings,
]);


// A canvas theme's coloured halo (War cyan, Osaka pink) on the active tab and
// the centre button — web's drop-shadow glow. One object per colour.
const glowCache = new Map<string, ViewStyle>();
function glowStyle(color: string): ViewStyle {
  let s = glowCache.get(color);
  if (!s) {
    s = {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.7,
      shadowRadius: 8,
      // Android draws a coloured shadow only behind a non-transparent fill.
      ...(Platform.OS === "android" ? { backgroundColor: "rgba(255,255,255,0.01)", elevation: 0 } : null),
    };
    glowCache.set(color, s);
  }
  return s;
}
const NativeAnimatedPressable = NativeAnimated.createAnimatedComponent(Pressable);

// `routeName` + a stable `onPress`, rather than an `onPress` closure built at
// the call site. An inline arrow is a fresh identity on every render, which
// defeated this memo every single time — so all thirty-odd buttons, each with
// its own shared value and animated style, re-rendered whenever an unread
// count ticked or the tab changed. Same reasoning on ScrollNavButton below.
const NavButton = memo<{
  icon: IconName;
  label: string;
  isActive: boolean;
  isCenter?: boolean;
  routeName: string;
  onPress: (routeName: string) => void;
  index: number;
  tabW: number;
  animProgress: NativeAnimated.Value;
  badgeCount?: number;
}>(({ icon, label, isActive, isCenter, routeName, onPress, index, tabW, animProgress, badgeCount = 0 }) => {
  const { colors, isLight, isMinimal, skin } = useAppTheme();
  const scale = useRef(new NativeAnimated.Value(1)).current;

  const handlePress = useCallback(() => onPress(routeName), [onPress, routeName]);

  const handlePressIn = useCallback(() => {
    NativeAnimated.spring(scale, { toValue: 0.88, damping: 15, stiffness: 300, useNativeDriver: true, isInteraction: false }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    NativeAnimated.spring(scale, { toValue: 1, damping: 15, stiffness: 300, useNativeDriver: true, isInteraction: false }).start();
  }, [scale]);

  const animatedStyle = useMemo(() => {
    const staggerDelay = index * 0.07;
    const itemProgress = animProgress.interpolate({ inputRange: [staggerDelay, staggerDelay + 0.6], outputRange: [0, 1], extrapolate: 'clamp' });
    return {
      transform: [
        { scale: NativeAnimated.multiply(scale, itemProgress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })) },
        { translateY: itemProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      ],
      opacity: itemProgress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.85, 1] }),
    };
  }, [animProgress, index, scale]);

  if (isCenter) {
    const glyphColor = isMinimal ? MINIMAL_TAB_TEXT_ACTIVE : skin ? skin.centreIcon : colors.foreground;
    return (
      <NativeAnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.centerButton, animatedStyle]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.centerIconWrap,
            isLight && { backgroundColor: 'rgba(26,26,26,0.06)', borderColor: 'rgba(26,26,26,0.25)' },
            isMinimal && { backgroundColor: 'transparent', borderColor: MINIMAL_TAB_LINE },
            skin && skin.centre,
          ]}
        >
          {/* Native strokes stay visible without an elevated blur surface or deferred SVG mount. */}
          <View style={[styles.createStroke, { width: 20, height: 2, backgroundColor: glyphColor }]} />
          <View style={[styles.createStroke, { width: 2, height: 20, backgroundColor: glyphColor }]} />
        </View>
      </NativeAnimatedPressable>
    );
  }

  return (
    <NativeAnimatedPressable
      accessibilityRole="tab"
      // Which tab you are on is conveyed purely by icon colour and a glow, and
      // the unread count purely by a red badge — neither reaches a screen
      // reader on its own. `selected` handles the first; the count is folded
      // into the label because a sibling Text inside a labelled Pressable is
      // not announced.
      accessibilityLabel={badgeCount > 0 ? `${label}, ${badgeCount} unread` : label}
      accessibilityState={{ selected: isActive }}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.tabButton, { width: tabW }, animatedStyle]}
    >
      {/* Minimal shows the active tab by colour alone — no glow. */}
      <View
        style={
          isActive && !isLight && !isMinimal
            ? skin?.glow ? glowStyle(skin.glow) : styles.activeGlow
            : undefined
        }
      >
        <Icon
          name={icon}
          size={20}
          color={
            isMinimal
              ? isActive ? MINIMAL_TAB_TEXT_ACTIVE : MINIMAL_TAB_TEXT
              : skin
                ? isActive ? skin.barIconActive : skin.barIcon
                : isActive ? colors.foreground : isLight ? "rgba(26, 26, 26, 0.66)" : "rgba(255, 255, 255, 0.72)"
          }
          strokeWidth={isActive ? 2 : 1.75}
        />
      </View>
      {badgeCount > 0 && (
        <View style={[styles.badge, { right: tabW / 2 - 18, backgroundColor: colors.accent }]} pointerEvents="none">
          <Text style={[styles.badgeText, { color: colors.accentForeground }]} numberOfLines={1}>
            {badgeCount > 99 ? "99+" : badgeCount}
          </Text>
        </View>
      )}
    </NativeAnimatedPressable>
  );
});

const ScrollNavButton = memo<{
  icon: IconName;
  label: string;
  item: ScrollNavItem;
  onPress: (item: ScrollNavItem) => void;
  tabW: number;
  badgeCount?: number;
}>(
  ({ icon, label, item, onPress, tabW, badgeCount = 0 }) => {
    const { colors, isLight, isMinimal, skin } = useAppTheme();
    const scale = useRef(new NativeAnimated.Value(1)).current;
    useEffect(() => () => scale.stopAnimation(), [scale]);

    // SCROLL_NAV_ITEMS is module scope, so `item` is a stable identity and this
    // callback is too — which is what lets the memo above actually hold.
    const handlePress = useCallback(() => onPress(item), [onPress, item]);

    const handlePressIn = useCallback(() => {
      NativeAnimated.spring(scale, {
        toValue: 0.88,
        damping: 15,
        stiffness: 300,
        useNativeDriver: true,
        isInteraction: false,
      }).start();
    }, [scale]);

    const handlePressOut = useCallback(() => {
      NativeAnimated.spring(scale, {
        toValue: 1,
        damping: 15,
        stiffness: 300,
        useNativeDriver: true,
        isInteraction: false,
      }).start();
    }, [scale]);

    // Secondary buttons only animate on touch. Avoid keeping each hidden
    // button in the Reanimated props registry between presses.
    const animatedStyle = { transform: [{ scale }] };

    return (
      <NativeAnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={badgeCount > 0 ? `${label}, ${badgeCount} unread` : label}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.scrollNavItem, { width: tabW }, animatedStyle]}
      >
        <Icon
          name={icon}
          size={20}
          color={isMinimal ? MINIMAL_TAB_TEXT : skin ? skin.barIcon : isLight ? "rgba(26, 26, 26, 0.66)" : "rgba(255, 255, 255, 0.72)"}
          strokeWidth={1.75}
        />
        {badgeCount > 0 && (
          <View style={[styles.badge, { right: tabW / 2 - 18, backgroundColor: colors.accent }]} pointerEvents="none">
            <Text style={[styles.badgeText, { color: colors.accentForeground }]} numberOfLines={1}>
              {badgeCount > 99 ? "99+" : badgeCount}
            </Text>
          </View>
        )}
      </NativeAnimatedPressable>
    );
  },
);

const FloatingBottomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const { t } = useTranslation();
  const { colors, isLight, isMinimal, skin } = useAppTheme();
  const insets = useSafeAreaInsets();
  // Live, not a module constant — see tabWidthFor.
  const { width: screenW } = useWindowDimensions();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const { isKidsMode } = useKidsMode();
  const { currentSpace, isConnected, isModalOpen } = useStages();
  const hasStageChip = !!currentSpace && isConnected && !isModalOpen && !isKidsMode;
  const pillWidth = Math.min((screenW - 16) * 0.72, 340, screenW - 16 - (hasStageChip ? 44 : 0));
  const tabW = tabWidthFor(screenW);
  const user = useUser();
  const myUserId = ((user as any)?._id || (user as any)?.id) as string | undefined;
  const dmUnread = useTotalUnreadMessagesCount(myUserId);
  // Resting state by default: a mount that happens underneath the boot
  // preloader (every cold start) must appear settled, or the user catches the
  // tail of this choreography as movement right on top of the reveal. The
  // first mount after the curtain has lifted — auth replace, sign-out/in —
  // plays it once.
  const animProgress = useRef(new NativeAnimated.Value(1)).current;
  const containerAnim = useSharedValue(1);
  const entranceFade = useSharedValue(1);
  const hasAnimated = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // UIKit refuses to render a visual-effect view correctly when it or any
  // superview has an alpha below 1 — Apple documents this explicitly. The
  // entrance fade therefore rides its own withTiming value, which lands exactly
  // on 1, rather than the spring below: a spring settles asymptotically, so it
  // parked this container at ~0.9995 forever and quietly degraded the center
  // button's blur for the rest of the session.
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
    animProgress.setValue(0);
    containerAnim.value = 0;
    entranceFade.value = 0;
    containerAnim.value = withDelay(30, withSpring(1, { damping: 18, stiffness: 80, mass: 0.8 }));
    entranceFade.value = withDelay(30, withTiming(1, { duration: 320 }));
    const animation = NativeAnimated.timing(animProgress, {
      toValue: 1, delay: 100, duration: 700, easing: NativeEasing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
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

  // `state` changes on every navigation, so depending on it here handed every
  // button a new onPress each time and defeated their memo. The ref keeps the
  // callback stable while still reading the current routes.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Which tab, if any, has already taken a press since it gained focus.
  // Pressing the focused tab used to refetch the whole feed on the very first
  // press, which is why Home in this bar felt slow next to the feed nav bar's
  // Home (a cheap filter switch). The first press now only returns the list to
  // the top; a further press, while the same tab is still focused, refreshes.
  const refreshArmedRef = useRef<string | null>(null);

  const focusedRouteName = state.routes[state.index]?.name;
  useEffect(() => {
    // Leaving the tab by any route — this bar, the drawer, a back gesture —
    // disarms it, so arriving back on Home never lands on a refetching press.
    if (refreshArmedRef.current && refreshArmedRef.current !== focusedRouteName) {
      refreshArmedRef.current = null;
    }
  }, [focusedRouteName]);

  const handlePress = useCallback(
    (routeName: string) => {
      const current = stateRef.current;
      const route = current.routes.find((r) => r.name === routeName);
      const isFocused = current.routes[current.index]?.name === routeName;
      const intent: TabPressIntent = !isFocused
        ? "navigate"
        : refreshArmedRef.current === routeName
          ? "refresh"
          : "scrollToTop";
      refreshArmedRef.current = isFocused ? routeName : null;

      // `data` is typed as undefined for tabPress in the bottom-tabs event
      // map, so the cast sits on emit rather than on the payload.
      const event = (
        navigation.emit as (e: {
          type: "tabPress";
          target: string;
          canPreventDefault: true;
          data: { intent: TabPressIntent };
        }) => { defaultPrevented: boolean }
      )({
        type: "tabPress",
        target: route?.key ?? routeName,
        canPreventDefault: true,
        data: { intent },
      });

      if (!event.defaultPrevented && !isFocused) {
        navigation.navigate(routeName);
      }
    },
    [navigation],
  );

  const handleScrollItemPress = useCallback(
    (item: ScrollNavItem) => {
      if (item.url) {
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

  // The pill's bottom edge sits at outerWrap's -12 plus this padding. On
  // Android gesture navigation (an inset of roughly 16-34dp) the old
  // max(6, inset - 22) left it at -6, inside the swipe-home zone, so a tap on
  // the lower part of a tab could start a system gesture instead. There it now
  // clears the whole inset. The 48dp three-button bar keeps the old maths
  // (pill at 14dp), which it was laid out against.
  const androidGestureNav = Platform.OS === "android" && insets.bottom > 0 && insets.bottom < 40;
  const bottomPadding = androidGestureNav
    ? insets.bottom + 12
    : Math.max(Platform.OS === "android" ? 6 : 2, insets.bottom - 22);
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
    // view is a superview of the center button's UIVisualEffectView, and any
    // alpha below 1 anywhere above it kills the blur.
    const o = interpolate(tabSlide.value, [0, 0.5], [1, 0], "clamp");
    return {
      transform: [{ translateY: tabSlide.value * TAB_BAR_SLIDE }],
      opacity: o > 0.999 ? 1 : o,
    };
  });

  return (
    <Reanimated.View
      style={[
        styles.outerWrap,
        { paddingBottom: bottomPadding },
        hideStyle,
      ]}
      pointerEvents="box-none"
    >
      <Reanimated.View style={[styles.dock, entranceStyle]}>
      <View
        style={[
          styles.navContainer,
          { width: pillWidth },
          skin ? { borderRadius: skin.barBorder.borderRadius } : null,
        ]}
      >
        {/* The pill is a solid surface, not glass. It used to be a blur under a
            near-transparent wash, which meant its appearance was a function of
            whatever happened to be behind it — fine over the dark feed, clear
            glass with icons floating on video over Shorts — and it needed a
            96pt gradient scrim under it to hold a luminance floor. One opaque
            fill does the same job with no scrim, no per-platform blur library
            and no backdrop sampling on every scrolled frame. Minimal floats
            the same pill, flat black with its hairline border. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.pillFill,
            isLight && { backgroundColor: colors.background },
            isMinimal && { backgroundColor: "#000" },
            skin && skin.barFill,
          ]}
        />
        {skin?.grain ? (
          <Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          style={[
            styles.pillBorder,
            isLight && { borderColor: 'rgba(0, 0, 0, 0.12)' },
            isMinimal && { borderColor: MINIMAL_HAIRLINE },
            skin && skin.barBorder,
          ]}
        />
        {skin?.brackets ? <HudBrackets color={skin.brackets} /> : null}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.navRow}
        >
          {(isKidsMode ? TABS.filter((tab) => KIDS_MODE_SCREENS.has(tab.name as any)) : TABS).map((tab, index) => {
            const isActive = state.routes[state.index]?.name === tab.name;
            return (
              <NavButton
                key={tab.name}
                icon={tab.icon}
                label={t(tab.labelKey)}
                isActive={isActive}
                isCenter={tab.isCenter}
                routeName={tab.name}
                onPress={handlePress}
                index={index}
                tabW={tabW}
                animProgress={animProgress}
                badgeCount={tab.name === ScreenNames.DM && isAuthed ? dmUnread : 0}
              />
            );
          })}
          {SCROLL_NAV_ITEMS
            // Kids Mode first, and by allowlist — a `url` entry has no screen
            // to check, so it drops out too, which is correct: those open the
            // website outside the app's own filtering entirely.
            .filter((item) => !isKidsMode || (!!item.screen && KIDS_MODE_SCREENS.has(item.screen as any)))
            .filter((item) => isAuthed || !item.screen || !AUTHED_ONLY_SCREENS.has(item.screen as any))
            .filter((item) => DIGITAL_PURCHASES_ENABLED || !item.screen || !STOREFRONT_HIDDEN_SCREENS.has(item.screen as any))
            .map((item) => (
            <ScrollNavButton
              // Not the screen name: Wallet and Staking are both Dpay.
              key={item.labelKey}
              icon={item.icon}
              label={t(item.labelKey)}
              item={item}
              onPress={handleScrollItemPress}
              tabW={tabW}
              badgeCount={
                item.screen === ScreenNames.Notifications && isAuthed
                  ? user?.notificationCount ?? 0
                  : 0
              }
            />
          ))}
        </ScrollView>
      </View>
      {hasStageChip && <StageMiniPlayer />}
      </Reanimated.View>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  dock: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
  },
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
    // Still no Android elevation. The pill is opaque now, so a shadow would
    // render cleanly, but elevation on Android draws a hard slab edge under a
    // 16pt radius and the app has no other raised chrome to match it to.
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
  pillFill: {
    // zinc-900. The app background is #010305, so a flat near-black would make
    // the pill disappear into the page; this is the house raised-surface value
    // (UserProfileHeader's buttons, the context-menu panels) and reads as one
    // solid object over both the feed and full-bleed Shorts video.
    backgroundColor: "#18181B",
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
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
  // width comes in per-render from tabWidthFor — see the note on it.
  tabButton: {
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
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.30)",
  },
  createStroke: {
    position: "absolute",
    borderRadius: 1,
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
    alignItems: "center" as const,
    justifyContent: "center" as const,
    height: TAB_BAR_PILL_HEIGHT,
  },
  badge: {
    position: "absolute",
    top: 8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    // White-on-black, like every other count badge in the app — see HomeHeader.
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.35)",
  },
  badgeText: {
    color: "#09090B",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
  },
});

export default memo(FloatingBottomTabBar);
