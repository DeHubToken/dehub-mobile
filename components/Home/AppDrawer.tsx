import { DIGITAL_PURCHASES_ENABLED } from "../../config/storefront";
import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  BackHandler,
  Keyboard,
  Image as RNImage,
} from "react-native";
import { GRAIN, type ThemeSkin } from "../../theme/skins";
import HudBrackets from "../theme/HudBrackets";
import { Image } from "expo-image";
import { CommonActions, useNavigation, useNavigationState } from "@react-navigation/native";
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
import { DhbCoin } from "../common/DhbCoin";
import Icon, { type IconName } from "../ui/Icon";
import { useUser, useAuthState, useAuthActions } from "../../context/AuthContext";
import { ScreenNames } from "../../navigation/ScreenNames";
import { WEBSITE_LINK } from "../../config/links";
import { getAvatarUrl } from "../../libs/misc";
import { toastError, toastInfo } from "../../libs";
import { openInApp } from "../../libs/links.utils";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";

// The menu is a bottom sheet: grab handle, who is signed in, the search field,
// then a four-column grid of the same glossy 3D icons the web menu uses. It
// rises from the bottom in every locale, so there is no RTL mirroring to get
// wrong the way the old side drawer had to.

const OPEN_TIMING = { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
const CLOSE_TIMING = { duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };

const VELOCITY_THRESHOLD = 500;
// Fraction of the sheet height a downward drag has to cover to count as a close.
const POSITION_THRESHOLD = 0.3;
// Web caps its sheet at 85dvh; same here.
const SHEET_HEIGHT_RATIO = 0.85;

const GRID_GAP = 8;
const GRID_PADDING = 16;
const GRID_COLUMNS = 4;
// The sheet's 1px left and right borders sit inside the screen width.
const SHEET_BORDER_X = 2;
const ICON_SIZE = 44;

// Per-theme 3D artwork is served by the website (public/theme-icons/<theme>/),
// the same files the web menu draws, so both stay on one set. expo-image keeps
// them in its disk cache after the first open.
const RASTER_THEMES = new Set([
  "system", "minimal", "light", "cosmic", "hazy", "swarms", "lavalamp", "winter", "osaka", "jungle",
]);
// Bump alongside web's ThemedIcon when a file is redrawn in place, or the disk
// cache keeps serving the old art forever.
const ICON_REVISIONS: Record<string, string> = {
  dao: "?v=4",
  accounts: "?v=5", tv: "?v=5", usernames: "?v=5", email: "?v=5",
  staking: "?v=5", buy: "?v=5", bridge: "?v=5", fractions: "?v=4",
  // Crop leftovers stripped from these in place.
  audio: "?v=2", careers: "?v=2", communities: "?v=2", governance: "?v=2", home: "?v=2", live: "?v=2",
  notifications: "?v=2", posts: "?v=2", stages: "?v=2", subscriptions: "?v=2", trophy: "?v=2",
};
const themeIconUrl = (theme: string, key: string) =>
  `${WEBSITE_LINK}/theme-icons/${RASTER_THEMES.has(theme) ? theme : "system"}/${key}.webp${ICON_REVISIONS[key] ?? ""}`;

interface DrawerItem {
  icon: IconName;
  /** i18n key for the label (resolved with t() at render). */
  labelKey: string;
  screen?: string;
  params?: Record<string, any>;
  url?: string;
  requiresAuth?: boolean;
  /** Left out of the App Store build — see config/storefront. */
  storefrontHidden?: boolean;
  /** Screen lives inside the bottom-tab navigator (Root), so it needs nested navigation. */
  tab?: boolean;
  /**
   * Only listed while the menu search matches it — web's SEARCH_ONLY_ITEMS.
   * A real page reached from inside another one (Bridge from the wallet), so
   * the resting menu stays the length it is.
   */
  searchOnly?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

// Mirrors the web sidebar (NAV_ITEMS in cosmic-echo-hero's app.constants) —
// same order, labels and icons. Items with a native screen navigate in-app;
// the rest open the corresponding page on the website.
const NAV_ITEMS: DrawerItem[] = [
  // Search-only: Home and its feed tabs are already on the main screen twice.
  { icon: "House", labelKey: "nav.home", screen: ScreenNames.Home, tab: true, searchOnly: true },
  { icon: "User", labelKey: "nav.profile", screen: ScreenNames.Profile, requiresAuth: true },
  { icon: "Search", labelKey: "nav.explore", screen: ScreenNames.Explore, tab: true },
  { icon: "Wand", labelKey: "nav.prompt", screen: ScreenNames.Prompt },
  { icon: "Bell", labelKey: "nav.notifications", screen: ScreenNames.Notifications, requiresAuth: true },
  { icon: "MessageSquare", labelKey: "nav.messages", screen: ScreenNames.DM, requiresAuth: true, tab: true },
  { icon: "Users", labelKey: "nav.communities", screen: ScreenNames.Communities },
  { icon: "Sparkles", labelKey: "nav.assistant", screen: ScreenNames.AIChat, tab: true },
  { icon: "Settings", labelKey: "nav.settings", screen: ScreenNames.AccountSettings, requiresAuth: true },
  { icon: "Trophy", labelKey: "nav.leaderboard", screen: ScreenNames.Leaderboard },
  { icon: "ChartNoAxesCombined", labelKey: "nav.stats", screen: ScreenNames.Stats },
  { icon: "Bookmark", labelKey: "nav.bookmarks", screen: ScreenNames.MyLibrary, params: { initialTab: "saved" }, requiresAuth: true },
  { icon: "LayoutDashboard", labelKey: "nav.command", screen: ScreenNames.CommandCentre, requiresAuth: true, storefrontHidden: true },
  // Passes initialTab explicitly so returning here from the Staking entry
  // (same screen, different tab) resets to Buy instead of keeping Stake.
  { icon: "Wallet", labelKey: "nav.wallet", screen: ScreenNames.Dpay, params: { initialTab: "buy" }, requiresAuth: true, storefrontHidden: true },
  { icon: "CalendarDays", labelKey: "nav.events", screen: ScreenNames.Events },
  { icon: "Mic", labelKey: "nav.stages", screen: ScreenNames.Stages },
  { icon: "Lightbulb", labelKey: "nav.featureRequests", screen: ScreenNames.FeatureRequests },
  // Staking lives as a tab inside the wallet (Dpay) screen rather than its own
  // route, so it deep-links there. Web has it as a separate sidebar entry.
  { icon: "Vault", labelKey: "nav.staking", screen: ScreenNames.Dpay, params: { initialTab: "stake" }, requiresAuth: true, storefrontHidden: true },
  // Badge grants and existing allowances are available on every platform.
  { icon: "Zap", labelKey: "nav.superpowers", screen: ScreenNames.SuperPowers },
  // Emoji, sticker and GIF packs — creating one is a badge perk, so it sits with
  // the other things staking buys. Browsing and adding packs is open to all.
  { icon: "Smile", labelKey: "creatorPacks.title", screen: ScreenNames.Packs },
  { icon: "ShieldCheck", labelKey: "nav.governance", screen: ScreenNames.Governance },
  { icon: "Landmark", labelKey: "nav.dao", screen: ScreenNames.Dao, storefrontHidden: true },
  { icon: "Briefcase", labelKey: "screens.work", screen: ScreenNames.Work, storefrontHidden: true },
  { icon: "Users", labelKey: "nav.affiliate", screen: ScreenNames.Affiliate, requiresAuth: true, storefrontHidden: true },
  { icon: "Briefcase", labelKey: "nav.careers", screen: ScreenNames.Careers },
  // Search-only on the web sidebar; here it sits beside Careers, which links
  // to it for the ambassador role.
  { icon: "Star", labelKey: "nav.creators", screen: ScreenNames.Creators },
  { icon: "Store", labelKey: "screens.stores", screen: ScreenNames.Stores, storefrontHidden: true },
  { icon: "ChartPie", labelKey: "nav.fractions", screen: ScreenNames.Fractions, storefrontHidden: true },
  { icon: "AtSign", labelKey: "screens.usernames", screen: ScreenNames.Usernames, storefrontHidden: true },
  { icon: "IdCard", labelKey: "screens.accounts", screen: ScreenNames.Accounts, storefrontHidden: true },
  // Web sidebar: AI Agents sits just above Advertising.
  { icon: "Bot", labelKey: "nav.agents", screen: ScreenNames.Agents },
  { icon: "Megaphone", labelKey: "nav.ads", screen: ScreenNames.Ads, requiresAuth: true, storefrontHidden: true },
  { icon: "Tv", labelKey: "nav.tv", screen: ScreenNames.TV },
  // Sits between Stores and Glossary, as on the web sidebar. Only the games
  // that work on a touchscreen are listed — see config/arcade-games.
  { icon: "Gamepad2", labelKey: "nav.arcade", screen: ScreenNames.Arcade },
  // The third-party mini app store has its own storefront review pending.
  { icon: "LayoutGrid", labelKey: "miniApps.store.title", screen: ScreenNames.Apps, storefrontHidden: true },
  { icon: "ArrowDownToLine", labelKey: "nav.converter", screen: ScreenNames.Converter, requiresAuth: true },
  { icon: "FolderInput", labelKey: "nav.migrate", screen: ScreenNames.Migrate },
  { icon: "Scroll", labelKey: "nav.glossary", screen: ScreenNames.Glossary },
  { icon: "Map", labelKey: "nav.guide", screen: ScreenNames.Guide },
  { icon: "Plug", labelKey: "nav.connectAi", screen: ScreenNames.Connect },
  { icon: "ArrowLeftRight", labelKey: "nav.bridge", screen: ScreenNames.Bridge, searchOnly: true, storefrontHidden: true },
  { icon: "BookOpen", labelKey: "nav.docs", url: `${WEBSITE_LINK}/docs` },
  { icon: "FileText", labelKey: "nav.blog", url: `${WEBSITE_LINK}/docs/blog` },
  // Search-only on web too. Hidden on iOS: both pages exist to sell a plan.
  { icon: "Crown", labelKey: "nav.premium", screen: ScreenNames.Premium, storefrontHidden: true, searchOnly: true },
  { icon: "Tag", labelKey: "nav.pricing", screen: ScreenNames.Pricing, storefrontHidden: true, searchOnly: true },
];

// Row → 3D artwork (web ThemeIconKey). Rows without a bespoke render borrow the
// closest one: a flat glyph beside the glossy set reads as a broken tile, so
// the glyph is only the fallback for art that fails to download.
const ICON_KEYS: Record<string, string> = {
  "nav.home": "home", "nav.profile": "profile", "nav.explore": "search", "nav.prompt": "wand",
  "nav.notifications": "notifications", "nav.messages": "messages", "nav.communities": "communities",
  "nav.assistant": "assistant", "nav.settings": "settings", "nav.leaderboard": "trophy",
  "nav.stats": "stats", "nav.bookmarks": "bookmarks", "nav.command": "command", "nav.events": "events",
  "nav.stages": "stages", "nav.featureRequests": "features", "nav.staking": "staking",
  "nav.superpowers": "superpowers", "nav.governance": "governance", "nav.dao": "dao",
  "screens.work": "bounties", "nav.careers": "careers", "screens.stores": "stores",
  "nav.fractions": "fractions", "screens.usernames": "usernames", "screens.accounts": "accounts",
  "nav.ads": "ads", "nav.tv": "tv", "nav.arcade": "arcade", "miniApps.store.title": "stores", "nav.glossary": "glossary", "nav.bridge": "bridge",
  "nav.wallet": "buy", "creatorPacks.title": "images", "nav.affiliate": "subscriptions",
  "nav.creators": "subscriptions", "nav.agents": "assistant", "nav.converter": "videos",
  "nav.migrate": "bridge", "nav.guide": "pinned", "nav.connectAi": "command", "nav.docs": "posts",
  "nav.blog": "email", "nav.premium": "boost", "nav.pricing": "buy",
};

/** What the themes layer hands us; null for system/minimal (dark glass). */
type SheetSkin = ThemeSkin;

interface TileProps {
  label: string;
  icon: IconName;
  iconUrl?: string;
  width: number;
  active?: boolean;
  disabled?: boolean;
  soonLabel: string;
  skin: SheetSkin | null;
  /** War: glyphs in HUD cyan instead of raster art. */
  hud: boolean;
  square: boolean;
  onPress: () => void;
}

const Tile = memo<TileProps>(({ label, icon, iconUrl, width, active, disabled, soonLabel, skin, hud, square, onPress }) => {
  const glyphColor = hud
    ? skin?.glow ?? "#22D3EE"
    : active ? skin?.tabIconActive ?? "#FFFFFF" : skin?.tabIcon ?? "rgba(255,255,255,0.9)";
  // Offline or a failed download would otherwise leave an empty tile.
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => setArtFailed(false), [iconUrl]);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      activeOpacity={disabled ? 1 : 0.7}
      onPress={onPress}
      style={[
        styles.tile,
        { width },
        skin?.card,
        active && styles.tileActive,
        active && skin?.stripActive,
        square && styles.square,
        disabled ? { opacity: 0.45 } : null,
      ]}
    >
      {skin?.grain ? (
        <RNImage
          source={GRAIN}
          resizeMode="repeat"
          style={[StyleSheet.absoluteFill, { borderRadius: skin.card.borderRadius }]}
        />
      ) : null}
      {skin?.brackets ? <HudBrackets color={skin.brackets} length={8} width={1} /> : null}
      <View style={styles.tileIcon}>
        {iconUrl && !hud && !artFailed ? (
          <Image
            source={{ uri: iconUrl }}
            style={styles.tileImage}
            contentFit="contain"
            cachePolicy="disk"
            transition={120}
            onError={() => setArtFailed(true)}
          />
        ) : (
          <Icon name={icon} size={26} color={glyphColor} strokeWidth={1.6} />
        )}
      </View>
      <Text
        style={[styles.tileLabel, active && styles.tileLabelActive, skin?.tabIcon ? { color: active ? skin.tabIconActive ?? skin.tabIcon : skin.tabIcon } : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {disabled && <Text style={styles.soon}>{soonLabel}</Text>}
    </TouchableOpacity>
  );
});

interface AppDrawerProps {
  visible: boolean;
  onClose: () => void;
}

const AppDrawer: React.FC<AppDrawerProps> = ({ visible, onClose }) => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const { signOut } = useAuthActions();
  const user = useUser();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const themeName: string = appTheme.theme ?? (appTheme.isMinimal ? "minimal" : "system");
  const skin = appTheme.skin ?? null;
  const hud = themeName === "war";
  const square = !!skin?.square || appTheme.isMinimal;
  const [menuQuery, setMenuQuery] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Live size, so split-screen and unfolding resize the sheet and its
  // off-screen position instead of keeping the size from app start.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const SHEET_HEIGHT = screenHeight * SHEET_HEIGHT_RATIO;
  const tileWidth = Math.floor((screenWidth - SHEET_BORDER_X - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  // Current route name, so the matching tile highlights like the web menu.
  // Tab screens live nested under Root — descend into it to find them.
  const activeRouteName = useNavigationState((state: any) => {
    if (!state) return undefined;
    const root = state.routes?.[state.index];
    const app = root?.name === ScreenNames.App ? root.state : state;
    const top = app?.routes?.[app.index ?? 0];
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

  // Drag-to-dismiss lives on the handle and header only, so the tile grid
  // keeps its own vertical scroll.
  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate((e) => {
      progress.value = Math.max(0, Math.min(1, 1 - e.translationY / SHEET_HEIGHT));
    })
    .onEnd((e) => {
      dragging.value = false;
      const shouldClose =
        e.velocityY > VELOCITY_THRESHOLD ||
        (e.velocityY >= -VELOCITY_THRESHOLD && progress.value < 1 - POSITION_THRESHOLD);

      if (shouldClose) {
        progress.value = withTiming(0, CLOSE_TIMING);
        runOnJS(onClose)();
      } else {
        progress.value = withTiming(1, OPEN_TIMING);
      }
    })
    .onFinalize(() => {
      // A cancelled gesture must not leave the next open/close animation locked.
      if (dragging.value) {
        dragging.value = false;
        progress.value = withTiming(visible ? 1 : 0, visible ? OPEN_TIMING : CLOSE_TIMING);
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [SHEET_HEIGHT, 0]) },
    ],
  }));

  const navigate = useCallback(
    (screen: string, params?: Record<string, any>, tab?: boolean) => {
      onClose();
      Keyboard.dismiss();
      // This sheet is a sibling of AppNavigator's stack, so useNavigation
      // belongs to the outer App screen. Actions cannot navigate down into
      // that stack implicitly: include App, and Root for bottom-tab routes.
      // pop sits next to Root, not in the tab params: the menu also opens
      // from Profile, and there the App stack must go back to the Root
      // underneath instead of pushing a second one.
      navigation.dispatch(CommonActions.navigate({
        name: ScreenNames.App,
        params: tab
          ? { screen: ScreenNames.Root, params: { screen, params }, pop: true }
          : { screen, params },
      }));
    },
    [navigation, onClose],
  );

  // Menu search. Matching is a case-insensitive substring of the TRANSLATED
  // label, so it works in the language the tile is actually rendered in; prefix
  // matches sort ahead of mid-word ones and ties keep the menu's own order,
  // which Array#sort preserves.
  const visibleItems = useMemo(() => {
    const allowed = NAV_ITEMS.filter(
      (item) => (isSignedIn || !item.requiresAuth) && (DIGITAL_PURCHASES_ENABLED || !item.storefrontHidden),
    );
    const query = menuQuery.trim().toLowerCase();
    if (!query) return allowed.filter((item) => !item.searchOnly);
    return allowed
      .map((item) => ({ item, at: t(item.labelKey).toLowerCase().indexOf(query) }))
      .filter((entry) => entry.at !== -1)
      .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1))
      .map((entry) => entry.item);
  }, [isSignedIn, menuQuery, t]);

  const searching = menuQuery.trim().length > 0;

  // Never reopen the sheet mid-filter.
  useEffect(() => {
    if (!visible) setMenuQuery("");
  }, [visible]);

  // The escape hatch: run whatever was typed as a real search instead. `ts`
  // is a nonce — without it a repeat of the same term produces identical route
  // params, and the Explore screen has no change to react to.
  const runFullSearch = useCallback(() => {
    const query = menuQuery.trim();
    if (!query) return;
    setMenuQuery("");
    navigate(ScreenNames.Explore, { q: query, ts: Date.now() }, true);
  }, [menuQuery, navigate]);

  const handleItemPress = useCallback(
    (item: DrawerItem) => {
      if (item.disabled) {
        toastInfo(item.disabledMessage ?? t("screens.comingSoon"));
        return;
      }
      if (item.url) {
        onClose();
        openInApp(item.url);
      } else if (item.screen) {
        navigate(item.screen, item.params, item.tab);
      }
    },
    [navigate, onClose, t],
  );

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    onClose();
    try {
      await signOut();
    } catch (error) {
      toastError(error, t("settings.logoutFailed"));
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, onClose, signOut, t]);

  const handlePost = useCallback(() => {
    navigate(ScreenNames.Upload);
  }, [navigate]);

  const handleSignIn = useCallback(() => {
    navigate(ScreenNames.SignIn);
  }, [navigate]);

  const displayName = user?.displayName || user?.username || t("common.anonymous");
  const handle = user?.username ? `@${user.username}` : "";
  const avatarUrl = user?.avatarImageUrl ? getAvatarUrl(user.avatarImageUrl) : undefined;
  // The DHB the wallet actually holds; badgeBalance can include delegation.
  const dhbBalance = Math.floor(user?.ownBadgeBalance ?? user?.badgeBalance ?? 0);

  const renderItem = (item: DrawerItem) => {
    const key = ICON_KEYS[item.labelKey];
    return (
      <Tile
        key={item.labelKey}
        label={t(item.labelKey)}
        icon={item.icon}
        iconUrl={key ? themeIconUrl(themeName, key) : undefined}
        width={tileWidth}
        active={!!item.screen && item.screen === activeRouteName && !item.params}
        disabled={item.disabled}
        soonLabel={t("screens.soon")}
        skin={skin}
        hud={hud}
        square={square}
        onPress={() => handleItemPress(item)}
      />
    );
  };

  const hairline = skin?.card?.borderColor ?? "rgba(255, 255, 255, 0.10)";

  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 999 }]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel={t("common.close")}
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { height: SHEET_HEIGHT, backgroundColor: skin?.page ?? "#0B0B0E", borderColor: hairline },
          square && styles.square,
          sheetStyle,
        ]}
      >
        {/* Jungle's plank grain and War's HUD corners, as on the feed chrome. */}
        {skin?.grain ? (
          <RNImage source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} />
        ) : null}
        {skin?.brackets ? <HudBrackets color={skin.brackets} length={18} /> : null}
        {/* Opaque on purpose: expo-blur paints a flat tint on Android rather
            than blurring, and the one method that does blur re-snapshots the
            root view every frame and crashes when the feed mutates mid-draw. */}
        <GestureDetector gesture={panGesture}>
          <View>
            <View style={styles.handleZone}>
              <View style={styles.handle} />
            </View>

            {isSignedIn && user ? (
              <View style={styles.header}>
                <TouchableOpacity
                  style={styles.headerIdentity}
                  onPress={() => navigate(ScreenNames.Profile)}
                  activeOpacity={0.7}
                >
                  <Avatar uri={avatarUrl} size={44} name={displayName || handle} />
                  <View style={styles.headerText}>
                    <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
                    {handle ? <Text style={styles.headerHandle} numberOfLines={1}>{handle}</Text> : null}
                  </View>
                </TouchableOpacity>
                {DIGITAL_PURCHASES_ENABLED && dhbBalance > 0 && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${t("nav.wallet")} ${dhbBalance.toLocaleString()}`}
                    onPress={() => navigate(ScreenNames.Dpay, { initialTab: "buy" })}
                    activeOpacity={0.7}
                    style={[styles.balanceChip, square && styles.square]}
                  >
                    <DhbCoin size={16} />
                    <Text style={styles.balanceText}>{dhbBalance.toLocaleString()}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.header}>
                <TouchableOpacity style={styles.headerIdentity} onPress={handleSignIn} activeOpacity={0.7}>
                  <View style={[styles.signInIcon, square && styles.square]}>
                    <Icon name="User" size={22} color="#9CA3AF" />
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.headerName}>{t("screens.signIn")}</Text>
                    <Text style={styles.headerHandle}>{t("screens.tapToGetStarted")}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Menu search. Filters the tiles below; anything that is not a
                page is one tap away via the hand-off, which runs the query on
                the Explore tab. */}
            <View style={[styles.searchWrap, square && styles.square]}>
              <Icon name="Search" size={16} color="#808089" />
              <TextInput
                value={menuQuery}
                onChangeText={setMenuQuery}
                placeholder={t("sidebar.searchMenu")}
                placeholderTextColor="#808089"
                style={styles.searchInput}
                returnKeyType="search"
                onSubmitEditing={runFullSearch}
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={t("sidebar.searchMenu")}
              />
              {menuQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setMenuQuery("")}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("sidebar.clearSearch")}
                >
                  <Icon name="X" size={15} color="#A1A1AA" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </GestureDetector>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: GRID_PADDING, paddingBottom: 16 }}
        >
          {/* Same order as the web menu, one continuous grid. */}
          {visibleItems.length > 0 && (
            <View style={styles.grid}>
              {visibleItems.map(renderItem)}
            </View>
          )}

          {searching && (
            <>
              {visibleItems.length === 0 && (
                <Text style={styles.noMatches}>{t("sidebar.noMenuMatches")}</Text>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.6}
                onPress={runFullSearch}
                style={[styles.handoff, { borderTopColor: hairline }]}
              >
                <Icon name="Search" size={18} color="#A1A1AA" strokeWidth={1.8} />
                <Text style={styles.handoffText} numberOfLines={1}>
                  {t("sidebar.searchDehubFor", { query: menuQuery.trim() })}
                </Text>
                <Icon name="ChevronRight" size={16} color="#808089" />
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {isSignedIn && (
          <View style={[styles.footer, { borderTopColor: hairline }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.logOut")}
              activeOpacity={0.6}
              disabled={isSigningOut}
              onPress={handleSignOut}
              style={[styles.logoutButton, isSigningOut && styles.logoutButtonDisabled]}
            >
              <Icon name="LogOut" size={20} color="#A1A1AA" strokeWidth={1.8} />
              <Text style={styles.logoutLabel}>{t("sidebar.logOut")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.post")}
              activeOpacity={0.7}
              onPress={handlePost}
              style={styles.postButton}
            >
              <Icon name="SquarePen" size={20} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    zIndex: 999,
    elevation: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  square: {
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  handleZone: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.28)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: GRID_PADDING,
    marginBottom: 14,
    gap: 12,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  headerHandle: {
    color: "#A1A1AA",
    fontSize: 13,
    marginTop: 1,
  },
  signInIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  balanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  balanceText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 42,
    marginHorizontal: GRID_PADDING,
    marginBottom: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    // Android's TextInput carries its own vertical padding, which pushes the
    // text off-centre inside a fixed-height row.
    paddingVertical: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 10,
    minHeight: 84,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  tileActive: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  tileIcon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  tileImage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  tileLabel: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 11.5,
    fontWeight: "500",
    textAlign: "center",
    alignSelf: "stretch",
  },
  tileLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  soon: {
    color: "#A1A1AA",
    fontSize: 10,
    fontWeight: "500",
  },
  noMatches: {
    color: "#71717A",
    fontSize: 14,
    paddingVertical: 12,
  },
  handoff: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
  },
  handoffText: {
    flex: 1,
    color: "#A1A1AA",
    fontSize: 15,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
  },
  logoutButton: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  postButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButtonDisabled: {
    opacity: 0.5,
  },
  logoutLabel: {
    color: "#A1A1AA",
    fontSize: 15,
    fontWeight: "500",
  },
});

export default memo(AppDrawer);
