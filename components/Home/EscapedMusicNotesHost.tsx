import React, { memo, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import { optionalSkia } from '../../libs/skia';
import { NOTE_HEAD, NOTE_LIFETIME, NOTE_POP_TIME, NOTE_STEM, floatingNote, notePop } from './bubbleLift';
import { getEscapedMusicNotes, popMusicNotes, subscribeEscapedMusicNotes } from './escapedMusicNotes';
import type { FloatingBubble } from './musicNotesSkia';
import { useMusicMotion } from './useMusicMotion';

// Skia draws the bubbles and their pop like web's canvas; builds without it keep the SVG views.
const skia = optionalSkia(() => {
  const s = require('@shopify/react-native-skia') as typeof import('@shopify/react-native-skia');
  const draw = require('./musicNotesSkia') as typeof import('./musicNotesSkia');
  return { Canvas: s.Canvas, Picture: s.Picture, bubblesPicture: draw.bubblesPicture };
});

const FloatingNote = memo(({ note, clock, width, height, ink }: { note: FloatingBubble; clock: SharedValue<number>; width: number; height: number; ink: string }) => {
  const style = useAnimatedStyle(() => {
    const age = clock.value - note.born, pop = notePop(age);
    const p = floatingNote(age, note.seed, note.x, note.y, width, height);
    return { opacity: p.opacity * (1 - pop), transform: [{ translateX: p.x - 8 }, { translateY: p.y - 8 }, { rotate: `${p.rotation}rad` }, { scale: p.size * (1 + pop * .6) }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: 16, height: 16 }, style]}>
    <Svg width={16} height={16} viewBox="-5 -8 16 16">
      <Circle cx={3} cy={0} r={6} fill="none" stroke={ink} strokeWidth={.6} opacity={.22} />
      <Path d={NOTE_HEAD} fill={ink} />
      <Path d={NOTE_STEM} fill="none" stroke={ink} strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </Animated.View>;
});

function SkiaBubbles({ notes, clock, width, height, ink }: { notes: FloatingBubble[]; clock: SharedValue<number>; width: number; height: number; ink: string }) {
  const draw = skia!, bubblesPicture = draw.bubblesPicture;
  const picture = useDerivedValue(() => bubblesPicture(notes, clock.value, width, height, ink), [notes, width, height, ink]);
  return <draw.Canvas style={StyleSheet.absoluteFill}><draw.Picture picture={picture} /></draw.Canvas>;
}

export function EscapedMusicNotesHost() {
  const escaped = useSyncExternalStore(subscribeEscapedMusicNotes, getEscapedMusicNotes);
  const { width, height } = useWindowDimensions();
  const { isLight } = useAppTheme();
  const { reduced, foreground } = useMusicMotion();
  const clock = useSharedValue(0);
  // Each bubble's age runs on this clock, so it pauses with the app.
  const born = useRef(new Map<number, number>());
  const notes = useMemo<FloatingBubble[]>(() => escaped.map(note => {
    if (!born.current.has(note.id)) born.current.set(note.id, clock.value);
    return { ...note, born: born.current.get(note.id)! };
  }), [escaped, clock]);
  const frame = useFrameCallback(info => { clock.value += Math.min(50, info.timeSincePreviousFrame ?? 16) / 1000; }, false);
  useEffect(() => {
    frame.setActive(notes.length > 0 && foreground && !reduced);
    return () => frame.setActive(false);
  }, [frame, notes.length, foreground, reduced]);
  const pop = useCallback((ids: number[]) => {
    ids.forEach(id => born.current.delete(id));
    popMusicNotes(ids);
  }, []);
  useAnimatedReaction(() => {
    const gone: number[] = [];
    for (const note of notes) if (clock.value - note.born >= NOTE_LIFETIME + NOTE_POP_TIME) gone.push(note.id);
    return gone.join(',');
  }, (gone, previous) => {
    if (gone && gone !== previous) runOnJS(pop)(gone.split(',').map(Number));
  }, [notes]);
  if (!notes.length) return null;
  const ink = isLight ? '#203944' : '#e5f2f7';
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[StyleSheet.absoluteFill, { zIndex: 10000, opacity: reduced ? 0 : 1 }]}>
    {skia ? <SkiaBubbles notes={notes} clock={clock} width={width} height={height} ink={ink} />
      : notes.map(note => <FloatingNote key={note.id} note={note} clock={clock} width={width} height={height} ink={ink} />)}
  </View>;
}
