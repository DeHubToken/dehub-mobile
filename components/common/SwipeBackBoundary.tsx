import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, I18nManager, Keyboard, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { completesSwipeBack, pageSwipeAllowed, SWIPE_BACK_EDGE, SWIPE_BACK_PAGE_DISTANCE } from '../../libs/swipe-back';
import { SwipeBackActions, SwipeBackEdgeOwner, type BackAction, type ClaimEdgeSwipe, type RegisterBackAction } from '../../hooks/useSwipeBack';

export default function SwipeBackBoundary({ children, onBack, enabled = true, isFocused }: {
  children: React.ReactNode;
  onBack?: BackAction;
  enabled?: boolean;
  isFocused?: () => boolean;
}) {
  const actions = useRef(new Map<symbol, BackAction>());
  const [hasAction, setHasAction] = useState(false);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const register = useCallback<RegisterBackAction>((action) => {
    const key = Symbol();
    actions.current.set(key, action);
    setHasAction(true);
    return () => {
      actions.current.delete(key);
      setHasAction(actions.current.size > 0);
    };
  }, []);
  // A screen with its own interactive edge back (see useOwnEdgeSwipe).
  const [edgeOwners, setEdgeOwners] = useState(0);
  const claimEdge = useCallback<ClaimEdgeSwipe>(() => {
    setEdgeOwners(count => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setEdgeOwners(count => Math.max(0, count - 1));
    };
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const back = useCallback(() => {
    if (locked.current || isFocused?.() === false) return;
    const entries = Array.from(actions.current.values());
    const local = entries[entries.length - 1];
    const action = local ?? onBack;
    if (!action) return;
    locked.current = true;
    Keyboard.dismiss();
    timer.current = setTimeout(() => { locked.current = false; }, 600);
    action();
  }, [onBack, isFocused]);
  const direction = I18nManager.isRTL ? -1 : 1;
  const screenWidth = Dimensions.get('window').width;
  const active = enabled && edgeOwners === 0 && (hasAction || !!onBack) && Platform.OS !== 'ios';
  // Where the finger went down: the edge strip always goes back; further in,
  // only plain page does (not a sideways list, a text field or a slider).
  // Read on the UI thread, where the claim has to be made: a gesture's state
  // can only be set from a worklet.
  const pageOk = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const fromEdge = useSharedValue(true);
  const multi = useSharedValue(false);
  const page = useRef<View>(null);
  const markTouch = useCallback((event: GestureResponderEvent) => {
    pageOk.value = active && pageSwipeAllowed(event.target, page.current);
  }, [active, pageOk]);
  // The round arrow that comes in from the edge while the drag is held.
  const cueX = useSharedValue(0);
  const cueY = useSharedValue(0);
  const cueShown = useSharedValue(0);
  const cueStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, cueX.value * 1.6) * cueShown.value,
    transform: [
      { translateX: (-52 + 64 * cueX.value) * direction },
      { translateY: cueY.value },
      { scale: cueX.value >= 1 ? 1.08 : 0.8 + 0.2 * cueX.value },
    ],
  }));
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(active)
    // Decided by hand: a drag claims back only once it is clearly sideways,
    // so lists still scroll and inner swipes (pagers, reply swipes, pinch)
    // that claim at a smaller offset keep their drags.
    .manualActivation(true)
    .maxPointers(1)
    .onBegin(() => { 'worklet'; multi.value = false; })
    .onTouchesDown((event, state) => {
      'worklet';
      if (event.numberOfTouches > 1) { multi.value = true; state.fail(); return; }
      const touch = event.allTouches[0];
      if (!touch) return;
      startX.value = touch.absoluteX;
      startY.value = touch.absoluteY;
      fromEdge.value = (direction < 0 ? screenWidth - touch.absoluteX : touch.absoluteX) <= SWIPE_BACK_EDGE;
    })
    .onTouchesMove((event, state) => {
      'worklet';
      const touch = event.allTouches[0];
      if (!touch || event.numberOfTouches > 1) { multi.value = true; state.fail(); return; }
      const dx = (touch.absoluteX - startX.value) * direction;
      const dy = Math.abs(touch.absoluteY - startY.value);
      if (dy > 14 && dy >= Math.abs(dx)) { state.fail(); return; }
      if (dx < -14) { state.fail(); return; }
      const claim = fromEdge.value ? 14 : 24;
      if (dx > claim && dx > dy * 2) {
        if (!fromEdge.value && !pageOk.value) { state.fail(); return; }
        state.activate();
      }
    })
    .onStart((event) => {
      'worklet';
      cueY.value = Math.max(20, event.y - 22);
      cueShown.value = 1;
    })
    .onUpdate((event) => {
      'worklet';
      const need = fromEdge.value ? 64 : SWIPE_BACK_PAGE_DISTANCE;
      cueX.value = Math.min(1, Math.max(0, (event.translationX * direction) / need));
      cueY.value = Math.max(20, event.y - 22);
    })
    .onEnd((event) => {
      'worklet';
      const need = fromEdge.value ? 64 : SWIPE_BACK_PAGE_DISTANCE;
      if (!multi.value && completesSwipeBack(event.translationX * direction, event.translationY, event.velocityX * direction, need)) runOnJS(back)();
    })
    .onFinalize(() => {
      'worklet';
      cueShown.value = withTiming(0, { duration: 160 });
      cueX.value = withTiming(0, { duration: 160 });
    }), [active, direction, screenWidth, back, pageOk, startX, startY, fromEdge, multi, cueX, cueY, cueShown]);
  return <SwipeBackActions.Provider value={register}>
    <SwipeBackEdgeOwner.Provider value={claimEdge}>
      <GestureDetector gesture={gesture}>
        <View ref={page} style={{ flex: 1 }} collapsable={false} onTouchStart={markTouch}>
          {children}
          <Animated.View pointerEvents="none" style={[styles.cue, I18nManager.isRTL ? { right: 0 } : { left: 0 }, cueStyle]}>
            <Ionicons name="arrow-back" size={20} color="#fff" style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </Animated.View>
        </View>
      </GestureDetector>
    </SwipeBackEdgeOwner.Provider>
  </SwipeBackActions.Provider>;
}

// A dark chip with a white arrow reads on every theme, like the arrow on media.
const styles = StyleSheet.create({
  cue: {
    position: 'absolute', top: 0, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});
