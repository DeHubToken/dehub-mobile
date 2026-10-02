import FeedRefreshRing from './FeedRefreshRing';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '../../libs/haptics';
import Svg, { G, Polyline } from 'react-native-svg';
import { createElectricity, idleFrame } from './logo-electricity';

type Props = { refreshing?: boolean; source: ImageSourcePropType; width: number; height: number; tint: string; onPress?: () => void; label: string; hint?: string; expanded?: boolean; style?: StyleProp<ViewStyle>; hitSlop?: { top: number; bottom: number; left: number; right: number } };
export default function ElectricLogo({ refreshing = false, source, width, height, tint, onPress, label, hint, expanded, style, hitSlop }: Props) {
  const [frame, setFrame] = useState(idleFrame);
  const start = useRef<number | null>(null), raf = useRef(0), reduced = useRef(true), suppress = useRef(false), nextHaptic = useRef(0);
  const stop = () => { if (start.current !== null) suppress.current = Date.now() - start.current >= 3000; start.current = null; cancelAnimationFrame(raf.current); raf.current = 0; setFrame(idleFrame); };
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) reduced.current = value; });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced.current = value; });
    const app = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { mounted = false; cancelAnimationFrame(raf.current); motion.remove(); app.remove(); };
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
      <Image source={source} resizeMode="contain" fadeDuration={0} style={{ width, height, tintColor: tint }} />
      {refreshing && <FeedRefreshRing />}
      {frame.bolts.length > 0 && <Svg width={width + 20} height={height + 20} viewBox={`${-44 - 880 / width} ${-38 - 760 / height} ${88 + 1760 / width} ${76 + 1520 / height}`} style={{ position: 'absolute', left: -10, top: -10 }}>
        {frame.bolts.map((b, i) => <G key={i} opacity={b.opacity} fill="none" strokeLinejoin="miter" strokeLinecap="round"><Polyline points={b.points.map(p => p.join(',')).join(' ')} stroke={b.colour} strokeWidth={b.width + 2} opacity={.2}/><Polyline points={b.points.map(p => p.join(',')).join(' ')} stroke={b.colour} strokeWidth={b.width}/><Polyline points={b.points.map(p => p.join(',')).join(' ')} stroke="white" strokeWidth={.45}/></G>)}
      </Svg>}
    </View>
  </Pressable>;
}
