import React from 'react';
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

interface CollapsibleHeaderProps {
  /** From `useCollapsibleScreen().headerProps`. */
  style: StyleProp<ViewStyle>;
  /** From `useCollapsibleScreen().headerProps`. */
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}

/**
 * The header half of the hide-on-scroll chrome.
 *
 * Absolutely positioned OVER the content rather than above it in flow, which is
 * the whole trick: a header in flow would resize the list on every frame of the
 * slide. `InfiniteVideoFeed` documents what that looks like — relayout per
 * frame, and the feed scrolling at double speed.
 *
 * Render it AFTER the scroller in JSX. React Native has no implicit z-order, so
 * on Android sibling order is what decides which draws on top.
 */
export function CollapsibleHeader({ style, onLayout, children }: CollapsibleHeaderProps) {
  return (
    <Animated.View style={[styles.header, style]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
});
