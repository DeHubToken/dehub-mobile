import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HomePullRefreshContext } from '../../context/HomePullRefreshContext';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedProps, useAnimatedReaction, useAnimatedStyle,
  useSharedValue, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import { SmartImage } from '../common/SmartImage';
import { PULL_CANCEL_MS, PULL_RETURN_MS, pullForDrag, pullSpringProgress } from '../../libs/pill-pull-motion';
import { PROFILE_COVER_HEIGHT } from './useProfileCollapse';

/**
 * Pull down at the top of a profile to reload it (phone web does the same).
 * Pull: the cover photo stretches up into the gap and blurs more toward the
 * top. A ring in the theme colour fills round the profile photo; it runs
 * while the profile, counts and posts reload, then closes with one pop.
 * Everything runs on the UI thread and nothing moves at rest.
 */

export const PROFILE_PULL_THRESHOLD = 80;
const MIN_REFRESH_MS = 900;
const MAX_REFRESH_MS = 10_000;
const DONE_MS = 700;

/** 0 idle, 1 reloading, 2 just finished. */
export interface ProfilePullMotion {
  distance: SharedValue<number>;
  phase: SharedValue<number>;
}

export const ProfilePullContext = createContext<ProfilePullMotion | null>(null);
export const useProfilePull = () => useContext(ProfilePullContext);

export function useProfilePullRefresh(enabled: boolean, scrollY: SharedValue<number> | undefined, reloadProfile: () => unknown) {
  const distance = useSharedValue(0);
  const phase = useSharedValue(0);
  const pulling = useSharedValue(false);
  const returning = useSharedValue(false);
  const x = useSharedValue(0), y = useSharedValue(0);
  const fallbackScroll = useSharedValue(0);
  const offset = scrollY ?? fallbackScroll;
  // Every mounted profile tab list registers its reload; one pull runs them all
  // plus the header, so whichever tab is showing comes back fresh.
  const lists = useRef(new Set<() => void>());
  const register = useCallback((refresh: () => void) => {
    lists.current.add(refresh);
    return () => { lists.current.delete(refresh); };
  }, []);
  const reload = useRef(reloadProfile);
  reload.current = reloadProfile;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const refresh = useCallback(async () => {
    if (phase.value === 1) return;
    phase.value = 1;
    const began = Date.now();
    lists.current.forEach(run => { try { run(); } catch { /* a list failing must not stop the rest */ } });
    try {
      await Promise.race([Promise.resolve(reload.current()), new Promise(resolve => setTimeout(resolve, MAX_REFRESH_MS))]);
    } catch { /* the header keeps what it had */ }
    const wait = Math.max(0, MIN_REFRESH_MS - (Date.now() - began));
    timers.current.push(setTimeout(() => {
      phase.value = 2;
      timers.current.push(setTimeout(() => { phase.value = 0; }, DONE_MS));
    }, wait));
  }, [phase]);

  useEffect(() => {
    if (!enabled) { cancelAnimation(distance); distance.value = 0; pulling.value = false; returning.value = false; }
  }, [enabled, distance, pulling, returning]);

  const gesture = useMemo(() => Gesture.Pan().enabled(enabled).maxPointers(1).manualActivation(true)
    .onTouchesDown((event, manager) => {
      if (phase.value === 1 || returning.value || offset.value > 1 || event.numberOfTouches !== 1) { manager.fail(); return; }
      x.value = event.allTouches[0]?.absoluteX ?? 0; y.value = event.allTouches[0]?.absoluteY ?? 0;
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch || event.numberOfTouches !== 1) { manager.fail(); return; }
      const dx = Math.abs(touch.absoluteX - x.value), dy = touch.absoluteY - y.value;
      if (dy < -8 || (dx > 12 && dx > dy)) { manager.fail(); return; }
      if (dy > 8 && dy > dx * 1.25) manager.activate();
    })
    .onStart(() => { cancelAnimation(distance); pulling.value = true; })
    .onUpdate(event => { distance.value = pullForDrag(event.translationY); })
    .onEnd((_event, success) => {
      const shouldRefresh = success && distance.value >= PROFILE_PULL_THRESHOLD && phase.value !== 1;
      pulling.value = false; returning.value = true;
      distance.value = withTiming(0, { duration: shouldRefresh ? PULL_RETURN_MS : PULL_CANCEL_MS, easing: pullSpringProgress, reduceMotion: ReduceMotion.System }, finished => {
        if (finished) returning.value = false;
      });
      if (shouldRefresh) runOnJS(refresh)();
    })
    .onFinalize(() => {
      if (!pulling.value) return;
      pulling.value = false; returning.value = true;
      distance.value = withTiming(0, { duration: PULL_CANCEL_MS, easing: pullSpringProgress, reduceMotion: ReduceMotion.System }, finished => {
        if (finished) returning.value = false;
      });
    }), [enabled, phase, returning, offset, x, y, distance, pulling, refresh]);

  const motion = useMemo(() => ({ distance, phase }), [distance, phase]);
  const listProvider = useMemo(() => ({ enabled, register }), [enabled, register]);
  return { gesture, motion, listProvider };
}

/** Moves the profile down with the finger. */
export function useProfilePullShift(motion: ProfilePullMotion) {
  return useAnimatedStyle(() => (
    motion.distance.value > 0 ? { transform: [{ translateY: motion.distance.value }] } : { transform: [] }
  ));
}

const AnimatedLayer = Animated.createAnimatedComponent(View);

/**
 * Sits behind the profile list at the top of the screen. While a finger pulls,
 * the cover in the list hides and this copy shows instead, scaled from its top
 * so it fills the gap down to the cover's moved bottom edge. Two pre-blurred
 * copies, faded by gradient masks, make the blur deepen toward the top.
 */
export function ProfilePullCover({ motion, source }: { motion: ProfilePullMotion; source: ImageSourcePropType | { uri: string } }) {
  const { width } = useWindowDimensions();
  const layer = useAnimatedStyle(() => {
    const d = motion.distance.value;
    return { opacity: d > 0.5 ? 1 : 0, transform: [{ scale: 1 + d / PROFILE_COVER_HEIGHT }] };
  });
  const blur = useAnimatedStyle(() => ({ opacity: Math.min(1, motion.distance.value / PROFILE_PULL_THRESHOLD * 1.25) }));
  const image = (radius?: number) => (
    <SmartImage source={source as any} recyclingKey={`pull-${radius ?? 0}`} blurRadius={radius} contentFit="cover" style={StyleSheet.absoluteFill} />
  );
  return (
    <View pointerEvents="none" style={[styles.coverClip, { width }]}>
      <AnimatedLayer style={[styles.cover, { width, transformOrigin: 'top' }, layer]}>
        {image()}
        {/* 8% oversize keeps the blurred copies' soft edges off screen. */}
        <AnimatedLayer style={[StyleSheet.absoluteFill, styles.blurOversize, blur]}>
          <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient style={StyleSheet.absoluteFill} colors={['#000', 'rgba(0,0,0,0.7)', 'transparent']} locations={[0, 0.3, 0.7]} />}>
            {image(6)}
          </MaskedView>
          <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient style={StyleSheet.absoluteFill} colors={['#000', '#000', 'rgba(0,0,0,0.55)', 'transparent']} locations={[0, 0.12, 0.3, 0.5]} />}>
            {image(22)}
          </MaskedView>
        </AnimatedLayer>
      </AnimatedLayer>
    </View>
  );
}

/** Hides the list's own cover while the stretched copy is showing. */
export function useProfileCoverHidden() {
  const motion = useProfilePull();
  return useAnimatedStyle(() => ({ opacity: motion && motion.distance.value > 0.5 ? 0 : 1 }));
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const RING_GAP = 6;

/** Theme-colour ring round the profile photo: fills with the pull, runs while reloading, closes when done. */
export function ProfilePullRing({ size, radius, color }: { size: number; radius: number; color: string }) {
  const motion = useProfilePull();
  const fallback = useSharedValue(0);
  const phase = motion?.phase ?? fallback;
  const distance = motion?.distance ?? fallback;
  const spin = useSharedValue(0);
  const fade = useSharedValue(1);
  const box = size + RING_GAP * 2;
  const r = radius + RING_GAP;
  const length = 4 * (box - 3 - 2 * r) + 2 * Math.PI * r;
  // Starts and stops its own loop on the UI thread; idle costs nothing.
  useAnimatedReaction(() => phase.value, (next, previous) => {
    if (next === previous) return;
    if (next === 1) {
      fade.value = 1;
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System);
    } else {
      cancelAnimation(spin);
      if (next === 2) fade.value = withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 320 }));
      else fade.value = 1;
    }
  });
  const ring = useAnimatedProps(() => {
    const p = Math.min(1, distance.value / PROFILE_PULL_THRESHOLD);
    const state = phase.value;
    if (state === 1) return { strokeDasharray: [length * 0.26, length * 0.74], strokeDashoffset: -spin.value * length, strokeOpacity: 1 };
    if (state === 2) return { strokeDasharray: [length, length], strokeDashoffset: 0, strokeOpacity: fade.value };
    return { strokeDasharray: [length, length], strokeDashoffset: length * (1 - p), strokeOpacity: p > 0 ? 1 : 0 };
  });
  if (!motion) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -RING_GAP, top: -RING_GAP, width: box, height: box }}>
      <Svg width={box} height={box}>
        <AnimatedRect x={1.5} y={1.5} width={box - 3} height={box - 3} rx={r} ry={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" animatedProps={ring} />
      </Svg>
    </View>
  );
}

/** One small pop of the photo when a reload finishes. */
export function useProfileAvatarPop() {
  const motion = useProfilePull();
  const fallback = useSharedValue(0);
  const phase = motion?.phase ?? fallback;
  const scale = useSharedValue(1);
  useAnimatedReaction(() => phase.value, (next, previous) => {
    if (next === 2 && previous !== 2) {
      scale.value = withSequence(withTiming(0.94, { duration: 90 }), withTiming(1.07, { duration: 230, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 230 }));
    }
  });
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  blurOversize: { transform: [{ scale: 1.08 }] },
  coverClip: { position: 'absolute', top: 0, left: 0, height: PROFILE_COVER_HEIGHT + 200, overflow: 'hidden' },
  cover: { position: 'absolute', top: 0, left: 0, height: PROFILE_COVER_HEIGHT },
});

/** Wraps a profile list: the pull gesture, the stretched cover behind it and the shift. */
export function ProfilePullFrame({ pull, cover, children }: {
  pull: ReturnType<typeof useProfilePullRefresh>;
  cover?: ImageSourcePropType | { uri: string } | null;
  children: React.ReactNode;
}) {
  const shift = useProfilePullShift(pull.motion);
  return (
    <ProfilePullContext.Provider value={pull.motion}>
      <HomePullRefreshContext.Provider value={pull.listProvider}>
        <GestureDetector gesture={pull.gesture}>
          <View style={styles.frame}>
            {!!cover && <ProfilePullCover motion={pull.motion} source={cover} />}
            <Animated.View style={[styles.frame, shift]}>{children}</Animated.View>
          </View>
        </GestureDetector>
      </HomePullRefreshContext.Provider>
    </ProfilePullContext.Provider>
  );
}
