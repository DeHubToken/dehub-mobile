import { useCallback } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCollapsibleHeader } from './useCollapsibleHeader';

/**
 * Everything a screen needs to get the hide-on-scroll header, in one hook.
 *
 * `useCollapsibleHeader` gives the animation; wiring it to a screen took six
 * separate pieces done by hand — an absolutely positioned animated header, the
 * measured height fed back as content padding, `onScroll` plus
 * `scrollEventThrottle`, `scrollIndicatorInsets`, and `progressViewOffset` on
 * the RefreshControl. Miss one and the symptom is content sitting under the
 * header or a refresh spinner behind it. Three screens of sixty-seven had it,
 * which is the reason: web gets the same behaviour from one CSS rule and an
 * attribute, so the two apps had drifted badly apart.
 *
 * Usage — note that the header is rendered last, over the scroller:
 *
 *   const { headerProps, listProps, refreshOffset } = useCollapsibleScreen();
 *   ...
 *   <Animated.FlatList {...listProps({ padding: 16 })}
 *     refreshControl={<RefreshControl progressViewOffset={refreshOffset} … />} />
 *   <CollapsibleHeader {...headerProps}><ScreenHeader title={…} /></CollapsibleHeader>
 *
 * The list must be an `Animated.*` component — `scrollHandler` is a Reanimated
 * worklet, so it runs on the UI thread and never touches the JS thread while
 * you scroll.
 */
export function useCollapsibleScreen(options?: { bottomPadding?: number }) {
  const {
    headerHeight,
    headerAnimatedStyle,
    onHeaderLayout,
    scrollHandler,
    showHeader,
    translateY,
  } = useCollapsibleHeader();
  const insets = useSafeAreaInsets();
  // Enough to clear the home indicator. A screen that sits under the floating
  // tab pill (a tab screen, not a pushed one) wants roughly 80 instead.
  const bottomPadding = options?.bottomPadding ?? insets.bottom + 24;

  const listProps = useCallback(
    (contentContainerStyle?: StyleProp<ViewStyle>) => ({
      onScroll: scrollHandler,
      scrollEventThrottle: 16,
      scrollIndicatorInsets: { top: headerHeight },
      contentContainerStyle: [
        { paddingTop: headerHeight, paddingBottom: bottomPadding },
        contentContainerStyle,
      ] as StyleProp<ViewStyle>,
    }),
    [scrollHandler, headerHeight, bottomPadding],
  );

  return {
    /** Spread onto <CollapsibleHeader>. */
    headerProps: { style: headerAnimatedStyle, onLayout: onHeaderLayout },
    /** Spread onto the Animated scroller; pass any extra content padding. */
    listProps,
    /** For RefreshControl's progressViewOffset. */
    refreshOffset: headerHeight,
    /** Measured header height, for anything positioned by hand. */
    headerHeight,
    /** Bring the header back — e.g. when focusing an input inside it. */
    showHeader,
    /** Raw offset, for mirroring into TabBarHideContext. */
    translateY,
  };
}
