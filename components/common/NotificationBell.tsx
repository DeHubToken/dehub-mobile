import React, { memo, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  cancelAnimation, Easing, Extrapolation, interpolate, ReduceMotion,
  useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import Icon from '../ui/Icon';
import { useAppTheme } from '../../context/ThemeContext';
import { BELL_SIDE_RIPPLE_PATHS, notificationBellMotion } from '../../libs/notification-bell-motion';

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
  useEffect(() => {
    cancelAnimation(phase);
    phase.value = 0;
    if (active && focused && foreground && profile.unread > 0 && !reduced) {
      phase.value = withRepeat(withTiming(1, {
        duration: profile.cycleMs, easing: Easing.linear, reduceMotion: ReduceMotion.System,
      }), -1, false);
    }
    return () => cancelAnimation(phase);
  }, [active, focused, foreground, profile.unread > 0, profile.cycleMs, reduced, phase]);
  const swing = useAnimatedStyle(() => ({
    transform: [{ rotate: `${reduced ? 0 : interpolate(phase.value,
      [0, .05, .12, .18, .25, .31, .42, 1],
      [0, profile.swing, -.77 * profile.swing, .54 * profile.swing, -.31 * profile.swing, .15 * profile.swing, 0, 0],
      Extrapolation.CLAMP)}deg` }],
  }));
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: 'visible' }}>
      <Animated.View style={[{ width: size, height: size, transformOrigin: '50% 5%', overflow: 'visible' }, swing]}>
        <Icon name="Bell" size={size} color={color} />
        {profile.unread > 0 && BELL_SIDE_RIPPLE_PATHS.map((_, side) => [0, 1].map(echo => (
          <SideRipple key={`${side}-${echo}`} phase={phase} side={side} echo={echo} size={size}
            profile={profile} color={isLight ? '#dc3545' : '#ff6874'} reduced={reduced} />
        )))}
      </Animated.View>
    </View>
  );
});
