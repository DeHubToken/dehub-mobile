import React, { memo, useEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import { floatingNote, NOTE_HEAD, NOTE_STEM } from './bubbleLift';
import { getEscapedMusicNotes, subscribeEscapedMusicNotes, type EscapedMusicNote } from './escapedMusicNotes';
import { useMusicMotion } from './useMusicMotion';

const FloatingNote = memo(({ note, clock, width, height, ink }: { note: EscapedMusicNote; clock: SharedValue<number>; width: number; height: number; ink: string }) => {
  const born = useRef(clock.value).current;
  const style = useAnimatedStyle(() => {
    const p = floatingNote(clock.value - born, note.seed, note.x, note.y, width, height);
    return { opacity: p.opacity, transform: [{ translateX: p.x - 8 }, { translateY: p.y - 8 }, { rotate: `${p.rotation}rad` }, { scale: p.size }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: 16, height: 16 }, style]}>
    <Svg width={16} height={16} viewBox="-5 -8 16 16">
      <Circle cx={3} cy={0} r={6} fill="none" stroke={ink} strokeWidth={.6} opacity={.22} />
      <Path d={NOTE_HEAD} fill={ink} />
      <Path d={NOTE_STEM} fill="none" stroke={ink} strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </Animated.View>;
});

export function EscapedMusicNotesHost() {
  const notes = useSyncExternalStore(subscribeEscapedMusicNotes, getEscapedMusicNotes);
  const { width, height } = useWindowDimensions();
  const { isLight } = useAppTheme();
  const { reduced, foreground } = useMusicMotion();
  const clock = useSharedValue(0);
  const frame = useFrameCallback(info => { clock.value += Math.min(50, info.timeSincePreviousFrame ?? 16) / 1000; }, false);
  useEffect(() => {
    frame.setActive(notes.length > 0 && foreground && !reduced);
    return () => frame.setActive(false);
  }, [frame, notes.length, foreground, reduced]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { zIndex: 10000, opacity: reduced ? 0 : 1 }]}>
    {notes.map(note => <FloatingNote key={note.id} note={note} clock={clock} width={width} height={height} ink={isLight ? '#203944' : '#e5f2f7'} />)}
  </View>;
}
