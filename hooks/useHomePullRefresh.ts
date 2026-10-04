import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedReaction,
  useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useFeedPillRefreshing } from '../libs/feed-pill-refresh';
import { PULL_ECHO_CYCLE_MS, PULL_REFRESH_THRESHOLD, PULL_RETURN_MS, pullForDrag, pullSpringProgress } from '../libs/pill-pull-motion';

export function useHomePullRefresh(enabled: boolean, scrollOffset: SharedValue<number>, tab: number) {
  const distance = useSharedValue(0);
  const pulling = useSharedValue(false);
  const returning = useSharedValue(false);
  const flow = useSharedValue(0);
  const busy = useSharedValue(false);
  const x = useSharedValue(0), y = useSharedValue(0);
  const activeTab = useSharedValue(tab);
  const offsets = useSharedValue([0, 0, 0, 0, 0, 0]);
  const refreshing = useFeedPillRefreshing();
  const action = useRef<(() => void) | null>(null);
  const register = useCallback((refresh: () => void) => {
    action.current = refresh;
    return () => { if (action.current === refresh) action.current = null; };
  }, []);
  const refresh = useCallback(() => action.current?.(), []);
  useEffect(() => { busy.value = refreshing; }, [busy, refreshing]);
  useAnimatedReaction(
    () => ({ tab: activeTab.value, offset: scrollOffset.value }),
    (next, previous) => {
      if (previous && next.tab !== previous.tab) return;
      const saved = offsets.value.slice(); saved[next.tab] = Math.max(0, next.offset); offsets.value = saved;
    },
  );
  useEffect(() => {
    activeTab.value = tab;
    scrollOffset.value = offsets.value[tab] ?? 0;
  }, [tab, activeTab, scrollOffset, offsets]);
  useEffect(() => {
    if (!enabled) {
      cancelAnimation(distance); cancelAnimation(flow);
      distance.value = 0; flow.value = 0; pulling.value = false; returning.value = false;
    }
    return () => { cancelAnimation(distance); cancelAnimation(flow); };
  }, [enabled, distance, flow, pulling, returning]);

  const gesture = useMemo(() => Gesture.Pan().enabled(enabled).maxPointers(1).manualActivation(true)
    .onTouchesDown((event, manager) => {
      if (busy.value || returning.value || scrollOffset.value > 1 || event.numberOfTouches !== 1) { manager.fail(); return; }
      x.value = event.allTouches[0]?.absoluteX ?? 0; y.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch || event.numberOfTouches !== 1) { manager.fail(); return; }
      const dx = Math.abs(touch.absoluteX - x.value), dy = touch.absoluteY - y.value;
      if (dy < -8 || (dx > 12 && dx > dy)) { manager.fail(); return; }
      if (dy > 8 && dy > dx * 1.25) manager.activate();
    })
    .onStart(() => {
      cancelAnimation(distance); cancelAnimation(flow);
      pulling.value = true; flow.value = 0;
      flow.value = withRepeat(withTiming(1, { duration: PULL_ECHO_CYCLE_MS, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System);
    })
    .onUpdate(event => { distance.value = pullForDrag(event.translationY); })
    .onEnd((_event, success) => {
      const shouldRefresh = success && distance.value >= PULL_REFRESH_THRESHOLD && !busy.value;
      pulling.value = false; returning.value = true;
      distance.value = withTiming(0, { duration: shouldRefresh ? PULL_RETURN_MS : 1000, easing: pullSpringProgress, reduceMotion: ReduceMotion.System }, finished => {
        if (finished) { returning.value = false; cancelAnimation(flow); flow.value = 0; }
      });
      if (shouldRefresh) runOnJS(refresh)();
    })
    .onFinalize(() => {
      if (!pulling.value) return;
      pulling.value = false; returning.value = true;
      distance.value = withTiming(0, { duration: 1000, easing: pullSpringProgress, reduceMotion: ReduceMotion.System }, finished => {
        if (finished) { returning.value = false; cancelAnimation(flow); flow.value = 0; }
      });
    }), [enabled, busy, returning, scrollOffset, x, y, distance, pulling, flow, refresh]);

  return { gesture, motion: { distance, pulling, flow }, provider: useMemo(() => ({ enabled, register }), [enabled, register]) };
}
