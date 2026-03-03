import { useCallback, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import type { LayoutChangeEvent, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

const SNAP_TIMING = { duration: 200, easing: Easing.out(Easing.cubic) };

// Must scroll 10+ px in a new direction before the system recognises a
// direction change.  Finger jitter (±3 px) never reaches this, so the
// anchor stays put and the header stays rock-solid.
const DIR_CHANGE_THRESHOLD = 10;

// Ignore teleport-like jumps (programmatic scrollToOffset, FlatList recycle, etc.)
const JUMP_GUARD = 300;

export const useCollapsibleHeader = () => {
  const translateY = useSharedValue(0);
  const negativeMargin = useSharedValue(0);
  const headerHeightSV = useSharedValue(0);

  // ── Worklet-side anchor state ──
  const wPrevY = useSharedValue(0);
  const wAnchorY = useSharedValue(0);
  const wHeaderAtAnchor = useSharedValue(0);
  const wDir = useSharedValue(0); // -1 up, 0 none, 1 down

  // ── JS-side anchor state ──
  const jsPrevY = useRef(0);
  const jsAnchorY = useRef(0);
  const jsHeaderAtAnchor = useRef(0);
  const jsDir = useRef(0);
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

  // ── Core worklet drive ──
  const driveWorklet = (scrollY: number) => {
    'worklet';
    const h = headerHeightSV.value;
    if (h <= 0) return;

    const delta = scrollY - wPrevY.value;
    wPrevY.value = scrollY;
    if (Math.abs(delta) > JUMP_GUARD) return;

    // At top of content: always fully visible
    if (scrollY <= 0) {
      wAnchorY.value = 0;
      wHeaderAtAnchor.value = 0;
      wDir.value = 0;
      cancelAnimation(translateY);
      cancelAnimation(negativeMargin);
      translateY.value = 0;
      negativeMargin.value = 0;
      return;
    }

    const newDir = delta > 0 ? 1 : delta < 0 ? -1 : 0;
    if (newDir === 0) return;

    // Direction change? Only accept if distance from anchor exceeds threshold.
    if (newDir !== wDir.value) {
      const distFromAnchor = Math.abs(scrollY - wAnchorY.value);
      if (distFromAnchor >= DIR_CHANGE_THRESHOLD || wDir.value === 0) {
        cancelAnimation(translateY);
        cancelAnimation(negativeMargin);
        wHeaderAtAnchor.value = translateY.value;
        wAnchorY.value = scrollY;
        wDir.value = newDir;
      }
    }

    // Header translateY = headerAtAnchor − (scrollY − anchorY), clamped.
    const displacement = scrollY - wAnchorY.value;
    const raw = wHeaderAtAnchor.value - displacement;
    const clamped = Math.max(-h, Math.min(raw, 0));

    translateY.value = clamped;
    negativeMargin.value = clamped;
  };

  const snapWorklet = () => {
    'worklet';
    const h = headerHeightSV.value;
    if (h <= 0) return;
    const cur = translateY.value;
    if (cur > -h && cur < 0) {
      const target = cur < -h / 2 ? -h : 0;
      translateY.value = withTiming(target, SNAP_TIMING);
      negativeMargin.value = withTiming(target, SNAP_TIMING);
      wHeaderAtAnchor.value = target;
      wAnchorY.value = wPrevY.value;
      wDir.value = 0;
    }
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      driveWorklet(event.contentOffset.y);
    },
    onEndDrag: () => {
      'worklet';
      snapWorklet();
    },
    onMomentumEnd: () => {
      'worklet';
      snapWorklet();
    },
  });

  // ── Core JS drive ──
  const driveJS = useCallback(
    (scrollY: number) => {
      const h = heightRef.current;
      if (h <= 0) return;

      const delta = scrollY - jsPrevY.current;
      jsPrevY.current = scrollY;
      if (Math.abs(delta) > JUMP_GUARD) return;

      if (scrollY <= 0) {
        jsAnchorY.current = 0;
        jsHeaderAtAnchor.current = 0;
        jsDir.current = 0;
        cancelAnimation(translateY);
        cancelAnimation(negativeMargin);
        translateY.value = 0;
        negativeMargin.value = 0;
        return;
      }

      const newDir = delta > 0 ? 1 : delta < 0 ? -1 : 0;
      if (newDir === 0) return;

      if (newDir !== jsDir.current) {
        const distFromAnchor = Math.abs(scrollY - jsAnchorY.current);
        if (distFromAnchor >= DIR_CHANGE_THRESHOLD || jsDir.current === 0) {
          cancelAnimation(translateY);
          cancelAnimation(negativeMargin);
          jsHeaderAtAnchor.current = translateY.value;
          jsAnchorY.current = scrollY;
          jsDir.current = newDir;
        }
      }

      const displacement = scrollY - jsAnchorY.current;
      const raw = jsHeaderAtAnchor.current - displacement;
      const clamped = Math.max(-h, Math.min(raw, 0));

      translateY.value = clamped;
      negativeMargin.value = clamped;
    },
    [translateY, negativeMargin],
  );

  // Called from InfiniteVideoFeed with (offsetY, deltaY).  We only use offsetY.
  const handleScrollOffset = useCallback(
    (offsetY: number, _deltaY: number) => {
      driveJS(offsetY);
    },
    [driveJS],
  );

  // Called from ScrollView / non-Animated FlatList onScroll
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      driveJS(e.nativeEvent.contentOffset.y);
    },
    [driveJS],
  );

  // Snap to nearest fully-shown or fully-hidden state
  const handleScrollEnd = useCallback(() => {
    const h = heightRef.current;
    if (h <= 0) return;
    const cur = translateY.value;
    if (cur > -h && cur < 0) {
      const target = cur < -h / 2 ? -h : 0;
      translateY.value = withTiming(target, SNAP_TIMING);
      negativeMargin.value = withTiming(target, SNAP_TIMING);
      jsHeaderAtAnchor.current = target;
      jsAnchorY.current = jsPrevY.current;
      jsDir.current = 0;
    }
  }, [translateY, negativeMargin]);

  // Programmatically reveal header (pull-to-refresh, tab press, etc.)
  const showHeader = useCallback(() => {
    cancelAnimation(translateY);
    cancelAnimation(negativeMargin);
    jsDir.current = 0;
    jsAnchorY.current = jsPrevY.current;
    jsHeaderAtAnchor.current = 0;
    translateY.value = withTiming(0, SNAP_TIMING);
    negativeMargin.value = withTiming(0, SNAP_TIMING);
  }, [translateY, negativeMargin]);

  return {
    headerAnimatedStyle,
    scrollHandler,
    handleScroll,
    handleScrollOffset,
    handleScrollEnd,
    onHeaderLayout,
    showHeader,
  };
};
