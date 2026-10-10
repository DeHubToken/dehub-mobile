import { Easing, ReduceMotion, withTiming } from 'react-native-reanimated';

// Shared with the Immersive capsule: reveal downward from behind the pill.
export const menuEnter = (values: { targetHeight: number }) => {
  'worklet';
  const timing = { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
  return {
    initialValues: { height: 0, opacity: 0, transform: [{ translateY: -8 }] },
    animations: { height: withTiming(values.targetHeight, timing), opacity: withTiming(1, timing), transform: [{ translateY: withTiming(0, timing) }] },
  };
};
export const menuExit = (values: { currentHeight: number }) => {
  'worklet';
  const timing = { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
  return {
    initialValues: { height: values.currentHeight, opacity: 1, transform: [{ translateY: 0 }] },
    animations: { height: withTiming(0, timing), opacity: withTiming(0, timing), transform: [{ translateY: withTiming(-8, timing) }] },
  };
};
