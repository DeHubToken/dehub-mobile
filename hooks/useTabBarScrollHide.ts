import { useCallback, useEffect } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useTabBarHide } from '../context/TabBarHideContext';

// Same feel as the home feed (useCollapsibleHeader): hidden after a deliberate
// scroll down, back on a deliberate scroll up, always shown near the top.
const TOP_THRESHOLD = 60;
const SCROLL_DEAD_ZONE = 40;
const JUMP_GUARD = 300;
const COOLDOWN_MS = 380;
// FloatingBottomTabBar hides once the value drops below -55.
const HIDDEN = -100;

/**
 * Hide-on-scroll for the bottom nav on screens that have no collapsing header
 * of their own to mirror (the profile pages). Writes straight into the
 * TabBarHideContext value the bar already watches, so the nearest provider
 * decides which bar moves. No provider, no-op.
 *
 * `drive` is a worklet, so it can be called from a useAnimatedScrollHandler;
 * `onScroll` is the plain handler for lists that take a JS callback.
 */
export function useTabBarScrollHide() {
  const tabBarHide = useTabBarHide();
  const prevY = useSharedValue(0);
  const accum = useSharedValue(0);
  const lastToggle = useSharedValue(0);

  const drive = useCallback(
    (y: number) => {
      'worklet';
      if (!tabBarHide) return;
      const delta = y - prevY.value;
      prevY.value = y;
      if (Math.abs(delta) > JUMP_GUARD) return;

      if (y <= TOP_THRESHOLD) {
        if (tabBarHide.value !== 0) tabBarHide.value = 0;
        accum.value = 0;
        return;
      }

      if ((delta > 0 && accum.value < 0) || (delta < 0 && accum.value > 0)) {
        accum.value = 0;
      }
      accum.value += delta;

      const now = Date.now();
      if (now - lastToggle.value < COOLDOWN_MS) return;

      if (accum.value > SCROLL_DEAD_ZONE && tabBarHide.value === 0) {
        tabBarHide.value = HIDDEN;
        accum.value = 0;
        lastToggle.value = now;
      } else if (accum.value < -SCROLL_DEAD_ZONE && tabBarHide.value !== 0) {
        tabBarHide.value = 0;
        accum.value = 0;
        lastToggle.value = now;
      }
    },
    [tabBarHide, prevY, accum, lastToggle],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => drive(e.nativeEvent.contentOffset.y),
    [drive],
  );

  // Leaving the profile must never strand the bar off-screen.
  useEffect(
    () => () => {
      if (tabBarHide) tabBarHide.value = 0;
    },
    [tabBarHide],
  );

  return { drive, onScroll };
}
