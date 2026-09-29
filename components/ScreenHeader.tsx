import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform, Keyboard, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import AppTopBar, { APP_TOP_BAR_HEIGHT } from './AppTopBar';
import { useAppTheme } from '../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../theme/minimal';
import { useCanGoBack } from '../hooks/useCanGoBack';

/**
 * Height of the title row in points, below the dehub mark bar.
 */
export const SCREEN_HEADER_TITLE_HEIGHT = 64;

/**
 * Total header height — the constant dehub mark bar plus the title row. For
 * layout that has to clear the header (collapsing headers, overlays pinned
 * under it).
 *
 * Do not add it to `keyboardVerticalOffset` when the KeyboardAvoidingView sits
 * below this header in the same parent. The view measures its own position
 * relative to that parent, so the header above it is already counted; adding
 * the height again lifts the field that far above the keyboard. The offset is
 * only where that parent starts on screen — see `hooks/useKeyboardLayout.ts`.
 */
export const SCREEN_HEADER_HEIGHT = APP_TOP_BAR_HEIGHT + SCREEN_HEADER_TITLE_HEIGHT;

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
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  canGoBack = true,
  rightContent,
  leftContent,
  titleAccessory,
  onBackPress,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { isMinimal } = useAppTheme();
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

  return (
    <View className="bg-theme-neutrals-900">
    {/* Minimal: one hairline under the whole header, not one per bar. */}
    <AppTopBar hairline={false} />
    <View
      className="flex-row items-center justify-between px-4 bg-theme-neutrals-900"
      style={{
        height: SCREEN_HEADER_TITLE_HEIGHT,
        paddingTop: 0,
        ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
        // Inside the fixed height, so SCREEN_HEADER_HEIGHT is unchanged.
        ...(isMinimal ? { borderBottomWidth: 1, borderBottomColor: MINIMAL_HAIRLINE } : {}),
      }}
    >
      <View className="flex-row items-center flex-1">
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            className="w-10 h-10 mr-2 items-center justify-center active:opacity-70"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t("common.goBack")}
          >
            {/* Icons are not mirrored by the layout; back points right in RTL. */}
            <Ionicons
              name="arrow-back"
              size={22}
              color={colors.neutrals[100]}
              style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </TouchableOpacity>
        )}
        {leftContent ? (
          <View className="mr-2">{leftContent}</View>
        ) : null}
        <View className="flex-shrink">
          <View className="flex-row items-center">
            <Text
              numberOfLines={1}
              className="text-theme-neutrals-100 text-2xl font-medium tracking-wide flex-shrink"
            >
              {title}
            </Text>
            {titleAccessory ? <View className="ml-2">{titleAccessory}</View> : null}
          </View>
          {subtitle ? (
            <Text
              numberOfLines={1}
              className="text-theme-neutrals-400 text-xs mt-0.5 tracking-wide"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightContent ? (
        <View className="ml-3 flex-row items-center">{rightContent}</View>
      ) : null}
      </View>
    </View>
  );
};

export default ScreenHeader;
