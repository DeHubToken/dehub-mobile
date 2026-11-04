import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Dimensions, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { DOUBLE_HEAD, DOUBLE_STEM, NOTE_HEAD, NOTE_STEM, escapePose, knobCutoff, tubeNote } from './bubbleLift';
import { canEscapeMusicNote, escapeMusicNote, getEscapedMusicNotes, subscribeEscapedMusicNotes } from './escapedMusicNotes';
import { useMusicMotion } from './useMusicMotion';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
interface VolumeTrackProps {
  value: number; active: boolean; fillColor: string; trackColor: string;
  height?: number; inset?: number; held?: boolean; children?: React.ReactNode;
}

export function VolumeTrack({ value, active, fillColor, trackColor, height = 10, inset = 10, held = false, children }: VolumeTrackProps) {
  const ref = useRef<View>(null);
  const [width, setWidth] = useState(0), [layoutHeight, setLayoutHeight] = useState(36);
  const { reduced, foreground } = useMusicMotion();
  const clock = useSharedValue(0), fade = useSharedValue(0), level = useSharedValue(value);
  const emitted = useSharedValue(-1);
  const notes = useSyncExternalStore(subscribeEscapedMusicNotes, getEscapedMusicNotes);
  const canEscape = canEscapeMusicNote();
  const on = active && value > 0 && !reduced && foreground && width > 0;
  const shown = Math.max(0, Math.min(1, value)), span = Math.max(0, width - inset * 2);
  const radius = held ? 15 : inset;
  const ink = fillColor === '#394955' ? '#eff9fc' : '#203944';
  const id = useId().replace(/:/g, '');
  const current = useRef({ on, width, layoutHeight, value: shown, radius, reduced });
  current.current = { on, width, layoutHeight, value: shown, radius, reduced };
  useEffect(() => { level.value = shown; }, [level, shown]);
  const frame = useFrameCallback(info => { clock.value += Math.min(50, info.timeSincePreviousFrame ?? 16) / 1000; }, false);
  useEffect(() => {
    fade.value = withTiming(on ? 1 : 0, { duration: on ? 300 : 450 });
    frame.setActive(on);
    return () => frame.setActive(false);
  }, [on, frame, fade]);
  const emit = useCallback(() => {
    if (!current.current.on || !canEscapeMusicNote()) return;
    ref.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      const live = current.current, screen = Dimensions.get('window');
      if (!live.on || live.reduced || AppState.currentState !== 'active' || measuredWidth <= 0 || measuredHeight <= 0) return;
      const px = x + inset + live.value * Math.max(0, measuredWidth - inset * 2) + live.radius + 12;
      const py = y + measuredHeight / 2 - 1.2 * height / 8;
      if (px < 0 || px > screen.width || py < 0 || py > screen.height) return;
      escapeMusicNote(px, py);
    });
  }, [inset, height]);
  useAnimatedReaction(() => escapePose(clock.value, 0, radius, height), p => {
    if (on && canEscape && p.ready && p.cycle !== emitted.value) { emitted.value = p.cycle; runOnJS(emit)(); }
  }, [on, canEscape, emit, radius, height, notes.length]);
  const cutoff = useAnimatedProps(() => ({ d: knobCutoff(inset + level.value * span, radius, height / 2) }));
  const group = useAnimatedProps(() => ({ opacity: fade.value }));
  const small = useAnimatedProps(() => {
    const p = escapePose(clock.value, inset + level.value * span, radius, height);
    const s = .48 * height / 8, a = s * Math.cos(-.18), b = s * Math.sin(-.18);
    return { opacity: p.ready || !canEscape ? 0 : p.opacity * .9,
      matrix: [a, b, -b, a, p.x - 3 * a, p.y - 3 * b] };
  });
  return <View ref={ref} collapsable={false} style={{ width: '100%', height: '100%', justifyContent: 'center' }} onLayout={e => { setWidth(e.nativeEvent.layout.width); setLayoutHeight(e.nativeEvent.layout.height); }}>
    <View pointerEvents="none" style={[styles.bar, { left: inset, right: inset, height, marginTop: -height / 2, borderRadius: height / 2, backgroundColor: trackColor }]} />
    <View pointerEvents="none" style={[styles.bar, { left: inset, width: shown * span, height, marginTop: -height / 2, borderRadius: height / 2, backgroundColor: fillColor }]} />
    {children}
    {!reduced && width > 0 && <Svg pointerEvents="none" width={width + 36} height={layoutHeight + 64} style={{ position: 'absolute', left: 0, top: -32 }}>
      <Defs>
        <ClipPath id={`${id}tube`}><Rect x={inset} y={-height / 2} width={span} height={height} rx={height / 2} /></ClipPath>
        <ClipPath id={`${id}knob`}><AnimatedPath animatedProps={cutoff} /></ClipPath>
      </Defs>
      <G transform={`translate(0 ${layoutHeight / 2 + 32})`}>
        <AnimatedG animatedProps={group} clipPath={`url(#${id}tube)`}>
          <G clipPath={`url(#${id}knob)`}>
            {Array.from({ length: Math.min(64, Math.ceil(width / 9)) }, (_, i) => <Note key={i} index={i} clock={clock} width={width} height={height} ink={ink} />)}
          </G>
          <AnimatedG animatedProps={small}><Glyph ink={ink} /></AnimatedG>
        </AnimatedG>
      </G>
    </Svg>}
    {!reduced && [0, 1].map(offset => <Echo key={offset} offset={offset} clock={clock} fade={fade} level={level} span={span} inset={inset} />)}
  </View>;
}

function Glyph({ ink, double = false }: { ink: string; double?: boolean }) {
  return <><Path d={NOTE_HEAD} fill={ink} /><Path d={double ? DOUBLE_STEM : NOTE_STEM} fill="none" stroke={ink} strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" />{double && <Path d={DOUBLE_HEAD} fill={ink} />}</>;
}
function Note({ index, clock, width, height, ink }: { index: number; clock: SharedValue<number>; width: number; height: number; ink: string }) {
  const props = useAnimatedProps(() => {
    const p = tubeNote(index, clock.value, width, height);
    const a = p.size * Math.cos(p.rotation), b = p.size * Math.sin(p.rotation);
    return { opacity: p.opacity, matrix: [a, b, -b, a, p.x - 3 * a, p.y - 3 * b] };
  });
  return <AnimatedG animatedProps={props}><Glyph ink={ink} double={index % 4 === 0} /></AnimatedG>;
}
function Echo({ offset, clock, fade, level, span, inset }: { offset: number; clock: SharedValue<number>; fade: SharedValue<number>; level: SharedValue<number>; span: number; inset: number }) {
  const base = inset + 2, size = (base + 12) * 2;
  const style = useAnimatedStyle(() => {
    const age = (((clock.value * 112 / 60 + offset) / 2) % 1) * 2 / 1.15;
    return { opacity: age >= 1 ? 0 : .55 * fade.value * (.55 + .45 * level.value) * Math.pow(1 - age, 1.6),
      transform: [{ translateX: inset + level.value * span - size / 2 }, { scale: (base + Math.min(1, age) * 12) / (base + 12) }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: '50%', marginTop: -size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 1.3, borderColor: 'transparent', borderRightColor: '#f0f8fa' }, style]} />;
}
const styles = StyleSheet.create({ bar: { position: 'absolute', top: '50%' } });
