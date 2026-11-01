import React, { memo, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  cancelAnimation, Easing, Extrapolation, interpolate, ReduceMotion,
  useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import Icon from '../ui/Icon';
import { useAppTheme } from '../../context/ThemeContext';
import { BELL_GLYPH_PATHS, BELL_SIDE_RIPPLE_PATHS, notificationBellMotion } from '../../libs/notification-bell-motion';
import { useAmbientMotion } from '../../hooks/useAmbientMotion';

// Phase of the cycle after which the swing, the red glow and both side ripples
// (latest echo starts at 0.13 and lasts 0.4) are all back at rest.
const RING_END = 0.56;

type Profile = ReturnType<typeof notificationBellMotion>;

function SideRipple({ phase, side, echo, size, profile, color, reduced }: {
  phase: SharedValue<number>;
  side: number;
  echo: number;
  size: number;
  profile: Profile;
  color: string;
  reduced: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const delay = (echo * 325 + side * 104) / profile.cycleMs;
    const progress = phase.value - delay;
    const reach = profile.reach * size / 26 * (side === 0 ? -1 : 1);
    return {
      opacity: reduced ? profile.opacity * .5 : progress < 0 ? 0
        : interpolate(progress, [0, .08, .4, 1], [0, profile.opacity, 0, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: reduced ? reach * .35 : interpolate(progress, [0, .4], [0, reach], Extrapolation.CLAMP) },
        { scaleY: reduced ? 1 : interpolate(progress, [0, .4], [.94, 1.12], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, left: 0, top: 0 }, style]}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Path d={BELL_SIDE_RIPPLE_PATHS[side]} fill="none" stroke={color}
          strokeWidth={profile.stroke + 1.8 * profile.intensity} strokeOpacity={.14} strokeLinecap="round" />
        <Path d={BELL_SIDE_RIPPLE_PATHS[side]} fill="none" stroke={color}
          strokeWidth={profile.stroke} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

export default memo(function NotificationBell({ unread = 0, size = 26, color, active = true }: {
  unread?: number;
  size?: number;
  color: string;
  active?: boolean;
}) {
  const profile = notificationBellMotion(unread);
  const { isLight } = useAppTheme();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const phase = useSharedValue(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  const ambient = useAmbientMotion();
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (!(active && focused && foreground && ambient && profile.unread > 0 && !reduced)) return;
    // Every layer is at rest from RING_END of the cycle on, so only the ring
    // itself is animated and a timer starts the next one. A repeat over the
    // whole cycle asked for a frame on every vsync while the bell sat still,
    // which kept Home redrawing ~70 times a second with nothing moving.
    const ring = () => {
      phase.value = 0;
      phase.value = withTiming(RING_END, {
        duration: profile.cycleMs * RING_END, easing: Easing.linear, reduceMotion: ReduceMotion.System,
      });
    };
    ring();
    const timer = setInterval(ring, profile.cycleMs);
    return () => {
      clearInterval(timer);
      cancelAnimation(phase);
    };
  }, [active, focused, foreground, ambient, profile.unread > 0, profile.cycleMs, reduced, phase]);
  const swing = useAnimatedStyle(() => ({
    transform: [{ rotate: `${reduced ? 0 : interpolate(phase.value,
      [0, .05, .12, .18, .25, .31, .42, 1],
      [0, profile.swing, -.77 * profile.swing, .54 * profile.swing, -.31 * profile.swing, .15 * profile.swing, 0, 0],
      Extrapolation.CLAMP)}deg` }],
  }));
  const red = isLight ? '#dc3545' : '#ff6874';
  const rimStrength = isLight ? .55 : .9;
  // While it rings the bell turns red with a neon rim, then cools back before it rests.
  const rim = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(phase.value, [0, .05, .26, .46, 1],
      [0, rimStrength, .8 * rimStrength, 0, 0], Extrapolation.CLAMP),
  }));
  const hot = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : interpolate(phase.value, [0, .05, .28, .48, 1], [0, 1, 1, 0, 0], Extrapolation.CLAMP),
  }));
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: 'visible' }}>
      <Animated.View style={[{ width: size, height: size, transformOrigin: '50% 5%', overflow: 'visible' }, swing]}>
        {profile.unread > 0 && (
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ scale: 1.05 }] }, rim]}>
            <Svg width={size} height={size} viewBox="0 0 32 32">
              {BELL_GLYPH_PATHS.map(d => (
                <Path key={d} d={d} fill={red} fillOpacity={.5} stroke={red} strokeOpacity={.28}
                  strokeWidth={2.6} strokeLinejoin="round" />
              ))}
            </Svg>
          </Animated.View>
        )}
        <Icon name="Bell" size={size} color={color} />
        {profile.unread > 0 && (
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, hot]}>
            <Icon name="Bell" size={size} color={red} />
          </Animated.View>
        )}
        {profile.unread > 0 && BELL_SIDE_RIPPLE_PATHS.map((_, side) => [0, 1].map(echo => (
          <SideRipple key={`${side}-${echo}`} phase={phase} side={side} echo={echo} size={size}
            profile={profile} color={red} reduced={reduced} />
        )))}
      </Animated.View>
    </View>
  );
});
