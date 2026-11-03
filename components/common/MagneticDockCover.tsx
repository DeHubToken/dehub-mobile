import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import SplashScreen from '../../screens/SplashScreen';
import { measureDockTarget, type DockTarget } from '../../libs/magneticDock';

const MARK = require('../../assets/web-icons/dehub-island-logo.png');
const CROSSFADE_MS = 420;

/** The existing boot gate owns readiness; this owns only the visual handoff. */
export default function MagneticDockCover({ reveal, enabled, onComplete }: {
  reveal: boolean; enabled: boolean; onComplete: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const entrySize = useRef({ width, height });
  const host = useRef<View>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const reduced = useRef(true);
  const [landing, setLanding] = useState<DockTarget | null>(null);
  const completeRef = useRef(onComplete);
  const finishRef = useRef<() => void>(() => {});
  completeRef.current = onComplete;
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) reduced.current = value; }).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduced.current = value; });
    return () => { mounted = false; listener.remove(); };
  }, []);

  useEffect(() => {
    if (!reveal) { entrySize.current = { width, height }; return; }
    if (entrySize.current.width !== width || entrySize.current.height !== height) {
      completeRef.current();
      return;
    }
    let cancelled = false;
    let target: DockTarget | null = null;
    let motion: Animated.CompositeAnimation | undefined;
    let finished = false;
    const finish = () => {
      if (cancelled || finished) return;
      finished = true;
      clearTimeout(failsafe);
      target?.hide(false);
      completeRef.current();
    };
    // A missing layout callback or interrupted animation must never hold entry.
    const failsafe = setTimeout(finish, 1400);
    finishRef.current = finish;
    const crossfade = () => {
      // Long enough to read as a reveal rather than a cut, eased so the page
      // arrives quickly and settles; the mark drifts forward as it goes.
      motion = Animated.timing(fade, { toValue: 0, duration: CROSSFADE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      motion.start(finish);
    };
    void (async () => {
      target = enabled && !reduced.current ? await measureDockTarget() : null;
      if (cancelled || finished) return;
      if (!target || target.y < 0 || target.y + target.height > height) { crossfade(); return; }
      const dock = target;
      host.current?.measureInWindow((x, y) => {
        if (cancelled || finished) return;
        const local = { ...dock, x: dock.x - x, y: dock.y - y };
        dock.hide(true);
        setLanding(local);
      });
    })();
    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      motion?.stop();
      progress.stopAnimation();
      target?.hide(false);
    };
  }, [reveal, enabled, fade, progress, width, height]);

  useEffect(() => {
    if (!landing) return;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 950, easing: Easing.bezier(.4, 0, .2, 1), useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) finishRef.current();
    });
    return () => animation.stop();
  }, [landing, progress]);

  const dx = landing ? landing.x + 21 - width / 2 : 0;
  const dy = landing ? landing.y + 18 - height / 2 : 0;
  return <View ref={host} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="auto" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: landing
      ? progress.interpolate({ inputRange: [0, .28, .78, 1], outputRange: [1, 1, 0, 0] }) : fade }]}>
      {!enabled && <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] }]}>
        <SplashScreen />
      </Animated.View>}
    </Animated.View>
    {enabled && <Animated.View style={{ position: 'absolute', left: width / 2 - 21, top: height / 2 - 18, width: 42, height: 36,
      opacity: fade, transform: [
        { translateX: progress.interpolate({ inputRange: [0, .1, .52, .7, .78, 1], outputRange: [0, 0, dx * .75 + 6, dx, dx, dx] }) },
        { translateY: progress.interpolate({ inputRange: [0, .1, .52, .7, .78, 1], outputRange: [0, 0, dy * .75, dy - 2, dy, dy] }) },
        { scale: progress.interpolate({ inputRange: [0, .1, .52, .7, .78, 1], outputRange: [120 / 42, 120 / 42, 1.2, .99, 1, 1] }) },
      ] }}>
      <Image source={MARK} resizeMode="contain" style={{ width: 42, height: 36, tintColor: '#fff' }} />
      {landing && <Animated.Image source={MARK} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: 42, height: 36, tintColor: landing.tint,
        opacity: progress.interpolate({ inputRange: [0, .35, .78, 1], outputRange: [0, 0, 1, 1] }),
      }]} />}
    </Animated.View>}
  </View>;
}
