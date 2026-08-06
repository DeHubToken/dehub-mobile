import { useCallback, useRef, useState } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import type { LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const ANIM_DURATION = 380;
const ANIM_CONFIG = { duration: ANIM_DURATION, easing: Easing.bezier(0.25, 1, 0.5, 1) };

const TOP_THRESHOLD = 60;
// 18px is inside the noise band of a normal fling — a finger that wobbles a
// couple of pixels the other way flipped the header, and the reversal was
// visible as a stutter. 40px is still well under a deliberate direction change.
const SCROLL_DEAD_ZONE = 40;
const JUMP_GUARD = 300;
// Must be >= ANIM_DURATION. At 250ms a second toggle could land while the first
// was still animating, cancelAnimation would tear it out mid-flight and the
// header would reverse from a partial offset — the "header flapping" jitter.
const COOLDOWN_MS = ANIM_DURATION;

export const useCollapsibleHeader = () => {
  const translateY = useSharedValue(0);
  const headerHeightSV = useSharedValue(0);
  const visibleSV = useSharedValue(1);

  const wPrevY = useSharedValue(0);
  const wAccum = useSharedValue(0);
  const wLastToggle = useSharedValue(0);

  const jsPrevY = useRef(0);
  const jsAccum = useRef(0);
  const jsVisible = useRef(true);
  const jsLastToggle = useRef(0);
  const heightRef = useRef(0);

  const [headerHeight, setHeaderHeight] = useState(0);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      heightRef.current = h;
      headerHeightSV.value = h;
      setHeaderHeight(h);
    }
  }, [headerHeightSV]);

  const animateTo = (target: number) => {
    'worklet';
    cancelAnimation(translateY);
    translateY.value = withTiming(target, ANIM_CONFIG);
    visibleSV.value = target === 0 ? 1 : 0;
  };

  const driveWorklet = (scrollY: number) => {
    'worklet';
    const h = headerHeightSV.value;
    if (h <= 0) return;

    const delta = scrollY - wPrevY.value;
    wPrevY.value = scrollY;
    if (Math.abs(delta) > JUMP_GUARD) return;

    if (scrollY <= TOP_THRESHOLD) {
      if (visibleSV.value !== 1) {
        animateTo(0);
        wLastToggle.value = Date.now();
      }
      wAccum.value = 0;
      return;
    }

    if ((delta > 0 && wAccum.value < 0) || (delta < 0 && wAccum.value > 0)) {
      wAccum.value = 0;
    }
    wAccum.value += delta;

    const now = Date.now();
    if (now - wLastToggle.value < COOLDOWN_MS) return;

    // Only hide once the header's own band has been scrolled past. The feed's
    // top spacer is a fixed `headerInset` tall, so hiding earlier would leave a
    // blank strip where the header used to be.
    if (wAccum.value > SCROLL_DEAD_ZONE && visibleSV.value === 1 && scrollY > h) {
      animateTo(-h);
      wAccum.value = 0;
      wLastToggle.value = now;
    } else if (wAccum.value < -SCROLL_DEAD_ZONE && visibleSV.value === 0) {
      animateTo(0);
      wAccum.value = 0;
      wLastToggle.value = now;
    }
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      driveWorklet(event.contentOffset.y);
    },
  });

  const driveJS = useCallback(
    (scrollY: number) => {
      const h = heightRef.current;
      if (h <= 0) return;

      const delta = scrollY - jsPrevY.current;
      jsPrevY.current = scrollY;
      if (Math.abs(delta) > JUMP_GUARD) return;

      if (scrollY <= TOP_THRESHOLD) {
        if (!jsVisible.current) {
          jsVisible.current = true;
          jsLastToggle.current = Date.now();
          animateTo(0);
        }
        jsAccum.current = 0;
        return;
      }

      if ((delta > 0 && jsAccum.current < 0) || (delta < 0 && jsAccum.current > 0)) {
        jsAccum.current = 0;
      }
      jsAccum.current += delta;

      const now = Date.now();
      if (now - jsLastToggle.current < COOLDOWN_MS) return;

      if (jsAccum.current > SCROLL_DEAD_ZONE && jsVisible.current && scrollY > h) {
        jsVisible.current = false;
        jsLastToggle.current = now;
        jsAccum.current = 0;
        animateTo(-h);
      } else if (jsAccum.current < -SCROLL_DEAD_ZONE && !jsVisible.current) {
        jsVisible.current = true;
        jsLastToggle.current = now;
        jsAccum.current = 0;
        animateTo(0);
      }
    },
    [translateY],
  );

  const handleScrollOffset = useCallback(
    (offsetY: number, _deltaY: number) => {
      driveJS(offsetY);
    },
    [driveJS],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      driveJS(e.nativeEvent.contentOffset.y);
    },
    [driveJS],
  );

  const handleScrollEnd = useCallback(() => {}, []);

  const showHeader = useCallback(() => {
    jsVisible.current = true;
    jsAccum.current = 0;
    jsLastToggle.current = Date.now();
    cancelAnimation(translateY);
    translateY.value = withTiming(0, ANIM_CONFIG);
    visibleSV.value = 1;
  }, [translateY, visibleSV]);

  return {
    translateY,
    headerHeight,
    headerAnimatedStyle,
    scrollHandler,
    handleScroll,
    handleScrollOffset,
    handleScrollEnd,
    onHeaderLayout,
    showHeader,
  };
};
