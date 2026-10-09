import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform, Keyboard, I18nManager, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { useAppTheme } from '../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../theme/minimal';
import { useCanGoBack } from '../hooks/useCanGoBack';
import ChromeSurface from './ui/ChromeSurface';
import { themeIconUrl } from '../theme/icons';

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
  /** Page identity artwork key (theme/icons.ts), drawn in the theme's own style. */
  icon?: string;
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
  icon,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { isMinimal, theme } = useAppTheme();
  const iconUrl = icon ? themeIconUrl(theme, icon) : undefined;
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

  useEffect(() => {
    return () => {
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, []);

  if (overlay || theme === 'system' || theme === 'immersive') {
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
        className="active:opacity-70"
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          top: 10,
          left: 10,
          zIndex: 20,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: 'rgba(0,0,0,0.45)',
          borderWidth: 1,
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
    <View className="bg-theme-neutrals-900" style={styles.bar}>
      {/* The floating title island, the same capsule material as the home
          feed's: glass on iOS, solid on Android, a hairline frame on minimal. */}
      <View style={styles.island}>
        {isMinimal ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.minimalFrame]} />
        ) : (
          <ChromeSurface radius={ISLAND_RADIUS} />
        )}
        <View className="flex-row items-center flex-1" style={{ minWidth: 0 }}>
          {showBack && (
            <TouchableOpacity
              onPress={handleBack}
              className="active:opacity-70"
              style={styles.square}
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
          <View className="ml-3 flex-row items-center" style={{ gap: 6 }}>{rightContent}</View>
        ) : null}
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
    justifyContent: 'center',
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  island: {
    height: 52,
    borderRadius: ISLAND_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
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
  icon: { width: 30, height: 30, marginRight: 8 },
  title: { fontSize: 17, fontWeight: '700', letterSpacing: 0.1 },
  subtitle: { fontSize: 11.5, marginTop: 1 },
});

export default ScreenHeader;
