import { useCallback, useRef, useState } from "react";
import { Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedReaction,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";

const WIN_HEIGHT = Dimensions.get("window").height;
const FULL_HEIGHT = WIN_HEIGHT;
const EXPAND_THRESHOLD = Math.round(WIN_HEIGHT * 0.8);
const COLLAPSE_THRESHOLD = Math.round(WIN_HEIGHT * 0.6);

const SNAP_SPRING = {
  damping: 28,
  stiffness: 520,
  mass: 0.9,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 2,
} as const;

export const useBottomSheetGestures = (
  initialHeight: number,
  onClose: () => void
) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);

  const COLLAPSED_HEIGHT = initialHeight;
  
  const height = useSharedValue(initialHeight);
  const scrollToTopHandlerRef = useRef<(() => void) | null>(null);
  const scrollY = useSharedValue(0);
  const isScrollEnabled = useSharedValue(false);
  const startHeight = useSharedValue(COLLAPSED_HEIGHT);
  const touchStartY = useSharedValue(0);

  const fullScreenProgress = useDerivedValue(() => {
    const denom = FULL_HEIGHT - COLLAPSED_HEIGHT;
    if (denom <= 0) return 1;
    const raw = (height.value - COLLAPSED_HEIGHT) / denom;
    return Math.max(0, Math.min(1, raw));
  });

  // Sync SharedValue to React state for FlatList
  useAnimatedReaction(
    () => isScrollEnabled.value,
    (value) => {
      runOnJS(setScrollEnabled)(value);
    }
  );

  const expandToFullScreen = () => {
    'worklet';
    isScrollEnabled.value = true;
    height.value = withSpring(FULL_HEIGHT, SNAP_SPRING);
  };

  const collapseToInitial = () => {
    'worklet';
    isScrollEnabled.value = false;
    scrollY.value = 0;
    height.value = withSpring(COLLAPSED_HEIGHT, SNAP_SPRING);
  };

  const registerScrollToTop = useCallback((handler: (() => void) | null) => {
    scrollToTopHandlerRef.current = handler;
  }, []);

  const scrollToTop = useCallback(() => {
    scrollToTopHandlerRef.current?.();
  }, []);

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event) => {
      'worklet';
      touchStartY.value = event.allTouches[0]?.y ?? 0;
    })
    .onTouchesMove((event, state) => {
      'worklet';
      const currentY = event.allTouches[0]?.y ?? touchStartY.value;
      const dy = currentY - touchStartY.value;

      // Collapsed: sheet drag should always work
      if (!isScrollEnabled.value) {
        state.activate();
        return;
      }

      // Fullscreen: only allow sheet drag when list is at top and user drags down
      if (scrollY.value <= 0 && dy > 0) {
        state.activate();
        return;
      }

      // Otherwise, fail so FlatList scroll wins.
      state.fail();
    })
    .onStart(() => {
      'worklet';
      startHeight.value = height.value;
    })
    .onUpdate((event) => {
      'worklet';
      const proposed = startHeight.value - event.translationY;
      const clamped = Math.max(
        COLLAPSED_HEIGHT,
        Math.min(FULL_HEIGHT, proposed)
      );
      height.value = clamped;
    })
    .onEnd((event) => {
      'worklet';
      const finalHeight = height.value;
      const velocity = event.velocityY;

      // Close if swiped down fast from collapsed state
      if (!isScrollEnabled.value && velocity > 1200) {
        runOnJS(onClose)();
        return;
      }

      // Dragging down from full screen with content at top
      if (
        isScrollEnabled.value &&
        scrollY.value <= 5 &&
        event.translationY > 50
      ) {
        runOnJS(setIsFullScreen)(false);
        runOnJS(scrollToTop)();
        collapseToInitial();
        return;
      }

      // Snap logic based on height and velocity
      if (
        finalHeight >= EXPAND_THRESHOLD ||
        (velocity < -500 && !isScrollEnabled.value)
      ) {
        runOnJS(setIsFullScreen)(true);
        height.value = withSpring(FULL_HEIGHT, {
          ...SNAP_SPRING,
          velocity: -velocity,
        });
        isScrollEnabled.value = true;
      } else if (finalHeight <= COLLAPSE_THRESHOLD || velocity > 500) {
        if (isScrollEnabled.value) {
          runOnJS(setIsFullScreen)(false);
          runOnJS(scrollToTop)();
          height.value = withSpring(COLLAPSED_HEIGHT, {
            ...SNAP_SPRING,
            velocity: -velocity,
          });
          isScrollEnabled.value = false;
          scrollY.value = 0;
        } else {
          runOnJS(onClose)();
        }
      } else {
        // Snap to nearest
        const distToFull = Math.abs(FULL_HEIGHT - finalHeight);
        const distToCollapsed = Math.abs(COLLAPSED_HEIGHT - finalHeight);

        if (distToFull < distToCollapsed) {
          runOnJS(setIsFullScreen)(true);
          height.value = withSpring(FULL_HEIGHT, {
            ...SNAP_SPRING,
            velocity: -velocity,
          });
          isScrollEnabled.value = true;
        } else {
          runOnJS(setIsFullScreen)(false);
          runOnJS(scrollToTop)();
          height.value = withSpring(COLLAPSED_HEIGHT, {
            ...SNAP_SPRING,
            velocity: -velocity,
          });
          isScrollEnabled.value = false;
          scrollY.value = 0;
        }
      }
    })
    .enabled(true);

  // Native scroll gesture for FlatList
  const scrollGesture = Gesture.Native();

  // Compose gestures to allow simultaneous pan and scroll
  const composedGesture = Gesture.Simultaneous(panGesture, scrollGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: height.value,
    };
  });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const expandToFullScreenJS = useCallback(() => {
    setIsFullScreen(true);
    isScrollEnabled.value = true;
    height.value = withSpring(FULL_HEIGHT, SNAP_SPRING);
  }, [height, isScrollEnabled]);

  const collapseToInitialJS = useCallback(() => {
    setIsFullScreen(false);
    isScrollEnabled.value = false;
    scrollY.value = 0;
    scrollToTop();
    height.value = withSpring(COLLAPSED_HEIGHT, SNAP_SPRING);
  }, [height, isScrollEnabled, scrollY, scrollToTop]);

  const resetGestureState = useCallback(() => {
    setIsFullScreen(false);
    scrollY.value = 0;
    isScrollEnabled.value = false;
    height.value = initialHeight;
    startHeight.value = initialHeight;
  }, [height, isScrollEnabled, scrollY, startHeight, initialHeight]);

  // Get current scroll enabled state without reading during render
  const getIsScrollEnabled = useCallback(() => {
    return isScrollEnabled;
  }, [isScrollEnabled]);

  return {
    animatedStyle,
    isFullScreen,
    fullScreenProgress,
    scrollEnabled,
    registerScrollToTop,
    composedGesture,
    GestureDetector,
    expandToFullScreen: expandToFullScreenJS,
    collapseToInitial: collapseToInitialJS,
    scrollHandler,
    resetGestureState,
  };
};
