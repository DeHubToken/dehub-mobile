import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform, Keyboard, I18nManager, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { useAppTheme } from '../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../theme/minimal';
import { useCanGoBack } from '../hooks/useCanGoBack';
import ChromeSurface from './ui/ChromeSurface';
import NavPillSurface from './ui/NavPillSurface';
import { themeIconUrl } from '../theme/icons';
import { pageIdentityIcon } from '../theme/pageIdentity';
import { useSwipeBackAction } from '../hooks/useSwipeBack';
import { PageHeaderContext } from './page/PageHeaderContext';

/**
 * Height of the title row in points. The dehub mark bar used to sit above it;
 * that bar is on Home only now (HomeHeader), so this is the whole header.
 */
export const SCREEN_HEADER_TITLE_HEIGHT = 64;

/**
 * Total header height (the title row). For
 * layout that has to clear the header (collapsing headers, overlays pinned
 * under it).
 *
 * Do not add it to `keyboardVerticalOffset` when the KeyboardAvoidingView sits
 * below this header in the same parent. The view measures its own position
 * relative to that parent, so the header above it is already counted; adding
 * the height again lifts the field that far above the keyboard. The offset is
 * only where that parent starts on screen — see `hooks/useKeyboardLayout.ts`.
 */
export const SCREEN_HEADER_HEIGHT = SCREEN_HEADER_TITLE_HEIGHT;

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  canGoBack?: boolean;
  rightContent?: React.ReactNode;
  /** Extra content rendered between the back button and title (e.g. avatar). */
  leftContent?: React.ReactNode;
  /** Small inline content right after the title text (e.g. an online dot). */
  titleAccessory?: React.ReactNode;
  onBackPress?: () => void;
  /** Immersive pages (a post whose media runs edge to edge at the top): no
   *  top bar and no title, just a round back button floating over the media,
   *  the same one the web post page shows. */
  overlay?: boolean;
  /** Show only the back arrow over a profile banner. */
  plainBack?: boolean;
  /** Page identity artwork key (theme/icons.ts), drawn in the theme's own style. */
  icon?: string;
  /** Web's title island, flat conversation chrome, or controls over media. */
  appearance?: 'island' | 'flat' | 'controls';
  /** Page navigation stays inside the same island as its title. */
  tabs?: React.ReactNode;
  /** Search belongs inside the list's title island. */
  children?: React.ReactNode;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  canGoBack = true,
  rightContent,
  leftContent,
  titleAccessory,
  onBackPress,
  overlay = false,
  plainBack = false,
  icon,
  appearance = 'island',
  tabs,
  children,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { isMinimal, theme } = useAppTheme();
  const state = navigation.getState?.();
  let activeRoute = state?.routes?.[state.index ?? 0];
  while (activeRoute?.state?.routes) {
    const nested = activeRoute.state;
    activeRoute = nested.routes[nested.index ?? 0] as typeof activeRoute;
  }
  const identity = icon ?? (appearance === 'island' ? pageIdentityIcon(activeRoute?.name) : undefined);
  const iconUrl = identity ? themeIconUrl(theme, identity) : undefined;
  // Not a one-off canGoBack() during render: a screen the menu opens renders
  // before its stack has saved the push, and one that never re-renders
  // (Careers) kept no arrow. The hook also reads the render-time stack and
  // follows the navigator after mount.
  const canPop = useCanGoBack();
  const showBack = canGoBack && (onBackPress || canPop);
  const backLockRef = useRef(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBack = useCallback(() => {
    // Debounce back to avoid rapid multiple navigations
    if (backLockRef.current) return;

    // Dismiss the keyboard BEFORE navigating. On iOS a screen that still owns
    // the first responder resigns it as the pop begins, and the transition is
    // cancelled part-way — the screen stays put and the press reads as having
    // done nothing. That is the "press back twice to leave a DM" report: the
    // first tap only closed the keyboard. Chat screens are where it bites,
    // because they are the ones you are always typing in.
    Keyboard.dismiss();

    let navigated = false;
    backLockRef.current = true;
    try {
      if (onBackPress) {
        onBackPress();
        navigated = true;
      } else if (showBack) {
        (navigation as any).goBack();
        navigated = true;
      }
    } finally {
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
      if (navigated) {
        backTimerRef.current = setTimeout(() => {
          backLockRef.current = false;
        }, 600);
      } else {
        // Nothing moved, so there is no duplicate navigation to guard against.
        // Holding the lock here would swallow the user's next tap and turn one
        // dead press into two.
        backLockRef.current = false;
      }
    }
  }, [navigation, onBackPress, showBack]);

  useSwipeBackAction(handleBack, !!showBack);

  useEffect(() => {
    return () => {
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, []);

  if (overlay || appearance === 'controls') {
    if (!showBack && !rightContent) return null;
    return (
      <View
        pointerEvents="box-none"
        style={[
          { height: overlay ? 56 : SCREEN_HEADER_HEIGHT, zIndex: 20 },
          overlay ? { position: 'absolute', top: 0, left: 0, right: 0 } : undefined,
        ]}
      >
      {showBack ? (
      <TouchableOpacity
        onPress={handleBack}
        className={plainBack ? "active:opacity-70" : "dark-surface active:opacity-70"}
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          top: 10,
          left: 10,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: plainBack ? 0 : 18,
          backgroundColor: plainBack ? 'transparent' : 'rgba(0,0,0,0.45)',
          borderWidth: plainBack ? 0 : 1,
          borderColor: 'rgba(255,255,255,0.18)',
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t("common.goBack")}
      >
        <Ionicons
          name="arrow-back"
          size={20}
          color="#FFFFFF"
          style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
        />
      </TouchableOpacity>
      ) : null}
      {rightContent ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 }}
        >
          {rightContent}
        </View>
      ) : null}
      </View>
    );
  }

  return (
    <View className={appearance ? undefined : 'bg-theme-neutrals-900'} style={appearance === 'flat' ? styles.flatBar : [styles.bar, tabs || children ? styles.searchBar : undefined]}>
      {/* The floating title island, the same capsule material as the home
          feed's: glass on iOS, solid on Android, a hairline frame on minimal. */}
      <View style={appearance === 'flat' ? styles.flatRow : [styles.island, tabs || children ? styles.searchIsland : undefined]}>
        {appearance === 'flat' ? null : appearance === 'island' ? (
          <NavPillSurface borderRadius={ISLAND_RADIUS} />
        ) : isMinimal ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.minimalFrame]} />
        ) : (
          <ChromeSurface radius={ISLAND_RADIUS} />
        )}
        <View style={styles.headingRow}>
          <View className="flex-row items-center flex-1" style={{ minWidth: 0 }}>
            {showBack && (
              <TouchableOpacity
                onPress={handleBack}
                className="active:opacity-70"
                style={appearance === 'flat' ? styles.flatBack : styles.square}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t("common.goBack")}
              >
                {/* Icons are not mirrored by the layout; back points right in RTL. */}
                <Ionicons
                  name="arrow-back"
                  size={19}
                  color={colors.neutrals[100]}
                  style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              </TouchableOpacity>
            )}
            {iconUrl ? (
              <Image source={{ uri: iconUrl }} style={styles.icon} contentFit="contain" cachePolicy="disk" />
            ) : null}
            {leftContent ? (
              <View className="mr-2">{leftContent}</View>
            ) : null}
            <View className="flex-shrink">
              <View className="flex-row items-center">
                <Text
                  numberOfLines={1}
                  className="text-theme-neutrals-100 flex-shrink"
                  style={styles.title}
                >
                  {title}
                </Text>
                {titleAccessory ? <View className="ml-2">{titleAccessory}</View> : null}
              </View>
              {subtitle ? (
                <Text
                  numberOfLines={1}
                  className="text-theme-neutrals-400"
                  style={styles.subtitle}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {rightContent ? (
            <View className="ml-2 flex-row items-center" style={{ gap: 6 }}>{rightContent}</View>
          ) : null}
        </View>
        <PageHeaderContext.Provider value>
          {tabs ? <View style={{ marginTop: 10 }}>{tabs}</View> : null}
          {children ? <View style={{ marginTop: 10 }}>{children}</View> : null}
        </PageHeaderContext.Provider>
      </View>
    </View>
  );
};

/** The island's corner: the home capsule's soft corner, never a full circle. */
const ISLAND_RADIUS = 15;

const styles = StyleSheet.create({
  bar: {
    height: SCREEN_HEADER_TITLE_HEIGHT,
    paddingHorizontal: 8,
    paddingTop: 8,
    justifyContent: 'flex-start',
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  island: {
    height: 56,
    borderRadius: ISLAND_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, width: '100%' },
  searchBar: { height: undefined, paddingTop: 8 },
  searchIsland: { height: undefined, flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 12, paddingVertical: 10 },
  flatBar: { height: SCREEN_HEADER_HEIGHT, paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  flatRow: { flexDirection: 'row', alignItems: 'center' },
  flatBack: { width: 32, height: 36, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  minimalFrame: {
    borderRadius: ISLAND_RADIUS,
    borderWidth: 1,
    borderColor: MINIMAL_HAIRLINE,
    backgroundColor: '#000',
  },
  square: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  icon: { width: 32, height: 32, marginRight: 10 },
  title: { fontSize: 17, fontWeight: '700', letterSpacing: 0.1 },
  subtitle: { fontSize: 11.5, marginTop: 1 },
});

export default ScreenHeader;
