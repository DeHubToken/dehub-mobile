import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18nManager, Keyboard, Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { completesSwipeBack } from '../../libs/swipe-back';
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
  const multiTouch = useRef(false);
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
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(enabled && edgeOwners === 0 && (hasAction || !!onBack) && Platform.OS !== 'ios')
    // Only the leading 28pt belong to back. Feed pagers, sliders, drawing and
    // image pinch/pan retain the rest of the screen.
    .hitSlop(I18nManager.isRTL ? { right: 0, width: 28 } : { left: 0, width: 28 })
    .activeOffsetX(direction * 14)
    .failOffsetY([-14, 14])
    .maxPointers(1)
    .runOnJS(true)
    .onBegin(() => { multiTouch.current = false; })
    .onTouchesDown((event) => { if (event.numberOfTouches > 1) multiTouch.current = true; })
    .onEnd((event) => {
      if (!multiTouch.current && completesSwipeBack(event.translationX * direction, event.translationY, event.velocityX * direction)) back();
    }), [enabled, edgeOwners, hasAction, onBack, direction, back]);
  return <SwipeBackActions.Provider value={register}>
    <SwipeBackEdgeOwner.Provider value={claimEdge}>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }} collapsable={false}>{children}</View>
      </GestureDetector>
    </SwipeBackEdgeOwner.Provider>
  </SwipeBackActions.Provider>;
}
