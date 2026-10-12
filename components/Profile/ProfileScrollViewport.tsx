import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';

/** Reveal the theme above the compact bar without moving the scrolling content. */
export default function ProfileScrollViewport({ scrollY, actionsBottom, children }: {
  scrollY: SharedValue<number>;
  actionsBottom: SharedValue<number>;
  children: React.ReactNode;
}) {
  const inset = useDerivedValue(() => scrollY.value >= actionsBottom.value ? 4 : 0);
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
