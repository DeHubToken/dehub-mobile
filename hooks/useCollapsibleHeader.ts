import { useCallback, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const TIMING_CONFIG = { duration: 280, easing: Easing.out(Easing.cubic) };
const SCROLL_THRESHOLD = 8;

/**
 * YouTube-style collapsible header.
 *
 * Uses translateY + negative marginBottom so the header stays in normal
 * layout flow. Wrap the header in:
 *
 *   <View style={{ overflow: 'hidden' }}>
 *     <Animated.View style={headerAnimatedStyle} onLayout={onHeaderLayout}>
 *       ...header content...
 *     </Animated.View>
 *   </View>
 */
export const useCollapsibleHeader = () => {
  const translateY = useSharedValue(0);
  const negativeMargin = useSharedValue(0);
  const heightRef = useRef(0);
  const isVisible = useRef(true);

  const prevScrollY = useRef(0);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    marginBottom: negativeMargin.value,
  }));

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) heightRef.current = h;
  }, []);

  const showHeader = useCallback(() => {
    if (!isVisible.current) {
      isVisible.current = true;
      translateY.value = withTiming(0, TIMING_CONFIG);
      negativeMargin.value = withTiming(0, TIMING_CONFIG);
    }
  }, [translateY, negativeMargin]);

  const hideHeader = useCallback(() => {
    const h = heightRef.current;
    if (!isVisible.current || h <= 0) return;
    isVisible.current = false;
    translateY.value = withTiming(-h, TIMING_CONFIG);
    negativeMargin.value = withTiming(-h, TIMING_CONFIG);
  }, [translateY, negativeMargin]);

  const handleScrollDirection = useCallback(
    (direction: 'up' | 'down', offsetY: number) => {
      if (heightRef.current <= 0) return;
      // Always show when near the top
      if (offsetY < heightRef.current) { showHeader(); return; }
      if (direction === 'down') hideHeader();
      else showHeader();
    },
    [showHeader, hideHeader],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - prevScrollY.current;
      prevScrollY.current = y;

      if (heightRef.current <= 0) return;

      if (y <= heightRef.current) {
        showHeader();
        return;
      }

      if (delta > SCROLL_THRESHOLD) hideHeader();
      else if (delta < -SCROLL_THRESHOLD) showHeader();
    },
    [showHeader, hideHeader],
  );

  return {
    headerAnimatedStyle,
    onHeaderLayout,
    handleScrollDirection,
    handleScroll,
    showHeader,
    hideHeader,
  };
};
