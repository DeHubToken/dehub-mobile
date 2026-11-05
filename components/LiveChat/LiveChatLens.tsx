import React, { useCallback, useId } from 'react';
import { AppState, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

/** Eight-point lens; only the internal light pulses, leaving the rim sharp. */
export function LiveChatLens() {
  const id = useId().replace(/:/g, '');
  const reducedMotion = useReducedMotion();
  const light = useSharedValue(1);
  useFocusEffect(useCallback(() => {
    const update = (state: string) => {
      cancelAnimation(light);
      light.value = 1;
      if (state === 'active' && !reducedMotion) {
        light.value = .51;
        light.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
      }
    };
    update(AppState.currentState);
    const subscription = AppState.addEventListener('change', update);
    return () => { subscription.remove(); cancelAnimation(light); };
  }, [light, reducedMotion]));
  const pulse = useAnimatedStyle(() => ({ opacity: light.value }));
  return (
    <View accessible={false} style={{ width: 8, height: 8, borderRadius: 4, overflow: 'hidden' }}>
      <Svg width={8} height={8} viewBox="0 0 8 8">
        <Defs><LinearGradient id={`${id}rim`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#c8d3cb" /><Stop offset=".24" stopColor="#4a554d" /><Stop offset=".6" stopColor="#18221a" /><Stop offset="1" stopColor="#829282" /></LinearGradient></Defs>
        <Circle cx={4} cy={4} r={4} fill={`url(#${id}rim)`} />
        <Circle cx={4} cy={4} r={3.2} fill="#020a05" />
      </Svg>
      <Animated.View style={[{ position: 'absolute', inset: 0 }, pulse]}>
        <Svg width={8} height={8} viewBox="0 0 8 8">
          <Defs><RadialGradient id={`${id}core`} cx="62%" cy="78%" rx="75%" ry="75%"><Stop offset="0" stopColor="#d6ff73" /><Stop offset=".22" stopColor="#89ee27" /><Stop offset=".46" stopColor="#23b729" /><Stop offset=".66" stopColor="#075021" /><Stop offset=".9" stopColor="#001f12" /></RadialGradient></Defs>
          <Circle cx={4} cy={4} r={3} fill={`url(#${id}core)`} />
        </Svg>
      </Animated.View>
      <Svg width={8} height={8} viewBox="0 0 8 8" style={{ position: 'absolute', inset: 0 }}>
        <Defs><RadialGradient id={`${id}glint`} cx="27%" cy="21%" rx="55%" ry="55%"><Stop offset="0" stopColor="#ffffff" stopOpacity={.93} /><Stop offset=".12" stopColor="#ebfff2" stopOpacity={.65} /><Stop offset=".7" stopColor="#ebfff2" stopOpacity={0} /></RadialGradient></Defs>
        <Circle cx={4} cy={4} r={3} fill={`url(#${id}glint)`} />
      </Svg>
    </View>
  );
}
