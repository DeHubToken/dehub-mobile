import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { PROFILE_BAR_HEIGHT } from './useProfileCollapse';

/** Keep scrolled content below the floating bar without moving the list. */
export default function ProfileScrollViewport({ scrollY, actionsBottom, tabsPinned, children }: {
  scrollY: SharedValue<number>;
  actionsBottom: SharedValue<number>;
  tabsPinned?: SharedValue<boolean>;
  children: React.ReactNode;
}) {
  // Clip the stationary viewport on the UI thread. The old 4pt top cut left
  // the bar's side gutters exposed to posts during a fling.
  const inset = useDerivedValue(() => tabsPinned?.value || scrollY.value >= actionsBottom.value ? PROFILE_BAR_HEIGHT - 4 : 0);
  const viewport = useAnimatedStyle(() => ({ marginTop: inset.value, marginBottom: -inset.value }));
  const content = useAnimatedStyle(() => ({ marginTop: -inset.value, marginBottom: inset.value }));
  return (
    <Animated.View style={[styles.viewport, viewport]}>
      <Animated.View style={[styles.content, content]}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
});
