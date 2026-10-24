import FeedRefreshRing from './FeedRefreshRing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaskedView from '@react-native-masked-view/masked-view';
import type { SharedValue } from 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '../../libs/haptics';
import Svg, { G, Polygon, Polyline } from 'react-native-svg';
import { createElectricity, idleFrame } from './logo-electricity';

type Props = { refreshing?: boolean; pullDistance?: SharedValue<number>; source: ImageSourcePropType; width: number; height: number; tint: string; onPress?: () => void; label: string; hint?: string; expanded?: boolean; style?: StyleProp<ViewStyle>; hitSlop?: { top: number; bottom: number; left: number; right: number } };
const CRUMBLE_KEY = 'dehub:logo-crumble-start:v1';
const CRUMBLE_MS = 5 * 24 * 60 * 60 * 1000;
const CRUMBLE_SHARDS = [
  ['0,0 30,0 24,36 0,42', -1.2, -.3, -8], ['30,0 58,0 54,31 24,36', .3, -1.1, 4], ['58,0 100,0 100,35 54,31', 1.4, -.5, 9],
  ['0,42 24,36 21,70 0,76', -1.5, .7, -7], ['24,36 54,31 51,68 21,70', 0, .2, 2], ['54,31 100,35 100,71 51,68', 1.7, .6, 8],
  ['0,76 21,70 25,100 0,100', -1.8, 1.4, -10], ['21,70 51,68 56,100 25,100', .2, 1.7, 5], ['51,68 100,71 100,100 56,100', 1.8, 1.1, 11],
] as const;
export default function ElectricLogo({ refreshing = false, pullDistance, source, width, height, tint, onPress, label, hint, expanded, style, hitSlop }: Props) {
  const [frame, setFrame] = useState(idleFrame);
  const [crumble, setCrumble] = useState(0);
  const start = useRef<number | null>(null), raf = useRef(0), reduced = useRef(true), suppress = useRef(false), nextHaptic = useRef(0);
  const stop = () => { if (start.current !== null) suppress.current = Date.now() - start.current >= 3000; start.current = null; cancelAnimationFrame(raf.current); raf.current = 0; setFrame(idleFrame); };
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) reduced.current = value; });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced.current = value; });
    const app = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { mounted = false; cancelAnimationFrame(raf.current); motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    let mounted = true;
    const update = async () => {
      const stored = await AsyncStorage.getItem(CRUMBLE_KEY);
      const started = stored ? Number(stored) : Date.now();
      if (!stored) await AsyncStorage.setItem(CRUMBLE_KEY, String(started));
      if (mounted) setCrumble(Math.min(1, Math.max(0, (Date.now() - started) / CRUMBLE_MS)));
    };
    void update();
    const timer = setInterval(() => { void update(); }, 60_000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  const begin = () => {
    if (start.current !== null) return;
    suppress.current = false; nextHaptic.current = 0; start.current = Date.now(); const electricity = createElectricity();
    setFrame({ ...idleFrame, held: true });
    let last = 0;
    const tick = () => { if (start.current === null) return; const now = Date.now();
      // Reuse the optional-native helper: old OTA clients safely skip this.
      if (!reduced.current && now - start.current >= 10000 && now >= nextHaptic.current) {
        haptic.press(); nextHaptic.current = now + 650 + Math.random() * 450;
      }
      if (now - last >= 32) { last = now; setFrame(electricity(now - start.current, reduced.current)); } raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
  };
  return <Pressable onPressIn={begin} onPressOut={stop} onPress={() => { if (!suppress.current) onPress?.(); suppress.current = false; }} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={expanded === undefined && !refreshing ? undefined : { expanded, busy: refreshing }} style={style}>
    <View pointerEvents="none" style={{ width, height, transform: [{ translateX: frame.x * width / 88 }, { translateY: frame.y * height / 76 }] }}>
      {frame.held && [-1, 1].map((side) => <Image key={side} source={source} resizeMode="contain" fadeDuration={0} style={{ position: 'absolute', width, height, opacity: .4, tintColor: frame.charged ? side < 0 ? '#72d9ff' : '#ffe86c' : '#ffffff', transform: [{ translateX: side * .7 }, { scale: 1.08 }] }} />)}
      <Image source={source} resizeMode="contain" fadeDuration={0} style={{ width, height, opacity: 1 - crumble * .72, tintColor: tint }} />
      {CRUMBLE_SHARDS.map(([points, x, y, rotation], index) => {
        const amount = Math.max(0, crumble - index * .018);
        return <MaskedView key={points} style={{ position: 'absolute', width, height, opacity: amount * .96, transform: [{ translateX: x * amount * 7 }, { translateY: y * amount * 7 }, { rotate: `${rotation * amount}deg` }] }} maskElement={<Svg width={width} height={height} viewBox="0 0 100 100"><Polygon points={points} fill="white" /></Svg>}><Image source={source} resizeMode="contain" fadeDuration={0} style={{ width, height, tintColor: tint }} /></MaskedView>;
      })}
      {[0, 1, 2, 3].map(index => <View key={index} style={{ position: 'absolute', left: width * (.24 + index * .19), top: height * (.18 + (index % 2) * .39), width: 2 + index % 2, height: 2 + index % 2, borderRadius: 4, backgroundColor: index % 2 ? '#9cecff' : '#ffe28a', opacity: crumble > .12 ? Math.min(.8, crumble * 1.3) : 0, transform: [{ translateX: (index - 1.5) * crumble * 13 }, { translateY: crumble * (8 + index * 3) }] }} />)}
      {(refreshing || pullDistance) && <FeedRefreshRing refreshing={refreshing} distance={pullDistance} color={tint} />}
      {frame.bolts.length > 0 && <Svg width={width + 20} height={height + 20} viewBox={`${-44 - 880 / width} ${-38 - 760 / height} ${88 + 1760 / width} ${76 + 1520 / height}`} style={{ position: 'absolute', left: -10, top: -10 }}>
        {frame.bolts.map((b, i) => <G key={i} opacity={b.opacity} fill="none" strokeLinejoin="miter" strokeLinecap="round"><Polyline points={b.points.map(p => p.join(',')).join(' ')} stroke={b.colour} strokeWidth={b.width + 2} opacity={.2}/><Polyline points={b.points.map(p => p.join(',')).join(' ')} stroke={b.colour} strokeWidth={b.width}/><Polyline points={b.points.map(p => p.join(',')).join(' ')} stroke="white" strokeWidth={.45}/></G>)}
      </Svg>}
    </View>
  </Pressable>;
}
