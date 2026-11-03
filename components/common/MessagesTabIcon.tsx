import React, { memo, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import Icon from '../ui/Icon';

// Envelope units (the icon's 32-unit viewBox). The letter sits behind the
// envelope and only the part above its top edge (y 5.2) shows.
const HIDDEN = 6;
const OUT = -5;
const DOWN = 0;
const REST = -2.6;
const RUN_MS = 3900;
// Same beats as the web keyframes (messages-nav-glyph.css): out at 9%, 42%, 75%, rest from 88%.
const BEATS: Array<[number, number]> = [[OUT, .09], [DOWN, .11], [OUT, .22], [DOWN, .11], [OUT, .22], [REST, .13]];

/**
 * Bottom bar Messages icon. Unread messages show as a small letter in the
 * theme colour peeking out of the envelope instead of a red count badge.
 * On each wake-up (first show, app back in front, a new message) the letter
 * pops out 3 times, then holds still: one ~4s run, nothing loops.
 */
export default memo(function MessagesTabIcon({ unread, size, color, letterColor, strokeWidth }: {
  unread: number;
  size: number;
  color: string;
  letterColor: string;
  strokeWidth?: number;
}) {
  const u = size / 32;
  const reduced = useReducedMotion();
  const offset = useSharedValue(REST);
  const [run, setRun] = useState(0);
  const last = useRef(unread);
  useEffect(() => {
    if (unread > last.current) setRun(n => n + 1);
    last.current = unread;
  }, [unread]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') setRun(n => n + 1); });
    return () => sub.remove();
  }, []);
  const hasUnread = unread > 0;
  useEffect(() => {
    cancelAnimation(offset);
    if (!hasUnread || reduced) { offset.value = REST; return; }
    offset.value = HIDDEN;
    offset.value = withSequence(...BEATS.map(([to, share]) =>
      withTiming(to, { duration: RUN_MS * share, easing: Easing.bezier(.3, .7, .3, 1) })));
    return () => cancelAnimation(offset);
  }, [run, hasUnread, reduced, offset]);
  const letter = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value * u }] }));
  return (
    <View style={{ width: size, height: size, overflow: 'visible' }}>
      {hasUnread && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: -14 * u, width: size, height: 19.2 * u, overflow: 'hidden' }}>
          <Animated.View style={[{
            position: 'absolute', left: 9.2 * u, top: 15 * u, width: 13.6 * u, height: 12 * u,
            borderRadius: 1.8 * u, backgroundColor: letterColor,
          }, letter]}>
            <View style={{
              position: 'absolute', left: 2.2 * u, top: 2.2 * u, width: 9.2 * u, height: 1.3 * u,
              borderRadius: .65 * u, backgroundColor: 'rgba(0, 0, 0, 0.35)',
            }} />
          </Animated.View>
        </View>
      )}
      <Icon name="MessageEnvelope" size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
});
