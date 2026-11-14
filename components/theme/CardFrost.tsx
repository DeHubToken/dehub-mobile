import React, { memo, useCallback } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { measure, useAnimatedRef, useAnimatedStyle } from 'react-native-reanimated';
import { frostClock, scaleAlpha, useBackdropFrost } from '../../libs/backdropFrost';

/** How much of the card's own tint stays over the frost. Web's phone cards
 *  sit near 45% smoke over a 24px blur; the app's tints run 70-86%. */
const VEIL = 0.72;
/** measure() runs on the UI runtime on phones; on web everything is one thread. */
const IS_WEB = Platform.OS === 'web';

/**
 * Frosted glass behind a feed card: the shared blurred copy of the wallpaper
 * (libs/backdropFrost), shifted so each card shows the part of the wallpaper
 * that is actually behind it, with the card's own tint laid over it.
 *
 * Returns null until the backdrop has posted a picture, so the card keeps its
 * plain tint (callers pass that tint here and drop it from the card only when
 * `useCardFrost()` says the frost is up).
 */
export const CardFrost = memo(function CardFrost({ radius, tint }: { radius: number; tint?: unknown }) {
  const frost = useBackdropFrost();
  const box = useAnimatedRef<View>();
  const shift = useAnimatedStyle(() => {
    // Re-run while a feed moves (the clock ticks) and after layout.
    frostClock.value;
    if (!IS_WEB && !globalThis._WORKLET) return { opacity: 0 };
    const m = measure(box);
    if (!m) return { opacity: 0 };
    return { opacity: 1, transform: [{ translateX: -m.pageX }, { translateY: -m.pageY }] };
  });
  // A card that mounts or moves in the list re-reads its spot once.
  const onLayout = useCallback(() => { frostClock.value = frostClock.value + 1; }, []);
  if (!frost) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Animated.View ref={box} collapsable={false} onLayout={onLayout} style={StyleSheet.absoluteFill}>
        <Animated.Image
          source={{ uri: frost.uri }}
          fadeDuration={0}
          resizeMode="stretch"
          style={[{ position: 'absolute', left: 0, top: 0, width: frost.width, height: frost.height }, shift]}
        />
      </Animated.View>
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: scaleAlpha(tint, VEIL) }]} /> : null}
    </View>
  );
});

/** True once the frost picture is up: the card then drops its own fill. */
export function useCardFrost(): boolean {
  return !!useBackdropFrost();
}

declare global {
  // Reanimated sets this on the UI runtime.
  // eslint-disable-next-line no-var
  var _WORKLET: boolean | undefined;
}
