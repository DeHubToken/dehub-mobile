import { useCallback, useRef, useState, useEffect } from "react";
import { Dimensions, FlatList } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  useAnimatedScrollHandler,
  useDerivedValue,
  useAnimatedReaction,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";

const WIN_HEIGHT = Dimensions.get("window").height;
const COLLAPSED_HEIGHT = Math.round(WIN_HEIGHT * 0.5);
const FULL_HEIGHT = WIN_HEIGHT;
const EXPAND_THRESHOLD = Math.round(WIN_HEIGHT * 0.8);
const COLLAPSE_THRESHOLD = Math.round(WIN_HEIGHT * 0.6);

export const useBottomSheetGestures = (
  initialHeight: number,
  onClose: () => void
) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  
  const height = useSharedValue(initialHeight);
  const flatListRef = useRef<FlatList>(null);
  const scrollY = useSharedValue(0);
  const isScrollEnabled = useSharedValue(false);
  const startHeight = useSharedValue(COLLAPSED_HEIGHT);

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
    height.value = withSpring(FULL_HEIGHT, {
      damping: 18,
      stiffness: 220,
    });
  };

  const collapseToInitial = () => {
    'worklet';
    isScrollEnabled.value = false;
    scrollY.value = 0;
    height.value = withSpring(COLLAPSED_HEIGHT, {
      damping: 18,
      stiffness: 220,
    });
  };

  const scrollToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startHeight.value = height.value;
    })
    .onUpdate((event) => {
      'worklet';
      // Only allow pan when scroll is at top or scroll is disabled
      if (isScrollEnabled.value && scrollY.value > 5) return;

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
        expandToFullScreen();
      } else if (finalHeight <= COLLAPSE_THRESHOLD || velocity > 500) {
        if (isScrollEnabled.value) {
          runOnJS(setIsFullScreen)(false);
          runOnJS(scrollToTop)();
          collapseToInitial();
        } else {
          runOnJS(onClose)();
        }
      } else {
        // Snap to nearest
        const distToFull = Math.abs(FULL_HEIGHT - finalHeight);
        const distToCollapsed = Math.abs(COLLAPSED_HEIGHT - finalHeight);

        if (distToFull < distToCollapsed) {
          runOnJS(setIsFullScreen)(true);
          expandToFullScreen();
        } else {
          runOnJS(setIsFullScreen)(false);
          runOnJS(scrollToTop)();
          collapseToInitial();
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
    height.value = withSpring(FULL_HEIGHT, {
      damping: 18,
      stiffness: 220,
    });
  }, [height, isScrollEnabled]);

  const collapseToInitialJS = useCallback(() => {
    setIsFullScreen(false);
    isScrollEnabled.value = false;
    scrollY.value = 0;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    height.value = withSpring(COLLAPSED_HEIGHT, {
      damping: 18,
      stiffness: 220,
    });
  }, [height, isScrollEnabled, scrollY]);

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
    scrollEnabled,
    flatListRef,
    composedGesture,
    GestureDetector,
    expandToFullScreen: expandToFullScreenJS,
    collapseToInitial: collapseToInitialJS,
    scrollHandler,
    resetGestureState,
  };
};
