import { useCallback, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const TIMING_CONFIG = { duration: 250, easing: Easing.out(Easing.cubic) };
const SCROLL_THRESHOLD = 5;
const JUMP_GUARD = 300; // ignore huge deltas from view-switch scrollToIndex

/**
 * YouTube-style collapsible header.
 *
 * Provides two scroll-handling modes:
 *  • scrollHandler  — worklet-based (useAnimatedScrollHandler) for Animated.FlatList / Animated.ScrollView
 *  • handleScroll   — JS-thread handler for regular ScrollView
 *  • handleScrollDirection — JS callback for InfiniteVideoFeed's onScrollDirectionChange
 */
export const useCollapsibleHeader = () => {
  const translateY = useSharedValue(0);
  const negativeMargin = useSharedValue(0);
  const headerHeightSV = useSharedValue(0);
  const isHidden = useSharedValue(false);

  // Separate prev-Y tracking for worklet vs JS paths
  const wPrevY = useSharedValue(0);
  const jsPrevY = useRef(0);
  const heightRef = useRef(0);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    marginBottom: negativeMargin.value,
  }));

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      heightRef.current = h;
      headerHeightSV.value = h;
    }
  }, [headerHeightSV]);

  const showHeader = useCallback(() => {
    isHidden.value = false;
    translateY.value = withTiming(0, TIMING_CONFIG);
    negativeMargin.value = withTiming(0, TIMING_CONFIG);
  }, [translateY, negativeMargin, isHidden]);

  const hideHeader = useCallback(() => {
    const h = heightRef.current;
    if (h <= 0) return;
    isHidden.value = true;
    translateY.value = withTiming(-h, TIMING_CONFIG);
    negativeMargin.value = withTiming(-h, TIMING_CONFIG);
  }, [translateY, negativeMargin, isHidden]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    'worklet';
    const y = event.contentOffset.y;
    const delta = y - wPrevY.value;
    wPrevY.value = y;

    const h = headerHeightSV.value;
    if (h <= 0 || Math.abs(delta) > JUMP_GUARD) return;

    if (y <= 0) {
      if (isHidden.value) {
        isHidden.value = false;
        translateY.value = withTiming(0, TIMING_CONFIG);
        negativeMargin.value = withTiming(0, TIMING_CONFIG);
      }
      return;
    }

    if (delta > SCROLL_THRESHOLD && !isHidden.value) {
      isHidden.value = true;
      translateY.value = withTiming(-h, TIMING_CONFIG);
      negativeMargin.value = withTiming(-h, TIMING_CONFIG);
    } else if (delta < -SCROLL_THRESHOLD && isHidden.value) {
      isHidden.value = false;
      translateY.value = withTiming(0, TIMING_CONFIG);
      negativeMargin.value = withTiming(0, TIMING_CONFIG);
    }
  });

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - jsPrevY.current;
      jsPrevY.current = y;

      if (heightRef.current <= 0 || Math.abs(delta) > JUMP_GUARD) return;

      if (y <= heightRef.current) {
        showHeader();
        return;
      }

      if (delta > SCROLL_THRESHOLD) hideHeader();
      else if (delta < -SCROLL_THRESHOLD) showHeader();
    },
    [showHeader, hideHeader],
  );

  const handleScrollDirection = useCallback(
    (direction: 'up' | 'down', offsetY: number) => {
      if (heightRef.current <= 0) return;
      if (offsetY < heightRef.current) { showHeader(); return; }
      if (direction === 'down') hideHeader();
      else showHeader();
    },
    [showHeader, hideHeader],
  );

  return {
    headerAnimatedStyle,
    scrollHandler,
    handleScroll,
    handleScrollDirection,
    onHeaderLayout,
    showHeader,
    hideHeader,
  };
};
