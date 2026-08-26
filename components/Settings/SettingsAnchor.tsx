/**
 * The two pieces the settings search jump needs on screen.
 *
 * `SettingsScrollView` is a drop-in for the `ScrollView` each settings panel
 * already uses — it hands its ref to the reveal store so a jump knows what to
 * scroll. Only one panel is mounted at a time, so one scroller is enough.
 *
 * `SettingsAnchor` wraps a section and does two things: reports its `y` inside
 * that scroll view (a direct child of the ScrollView, so `onLayout` is already
 * in content coordinates), and flashes when a search result points at it. The
 * flash is a white pulse, monochrome like the rest of the app, and it is what
 * turns "we switched your tab" into "this is the one".
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, ScrollView, type LayoutChangeEvent, type ScrollViewProps } from 'react-native';

import {
  registerSettingsAnchor,
  setSettingsScroller,
  subscribeSettingsHighlight,
  unregisterSettingsAnchor,
  getSettingsHighlight,
} from '../../libs/settings-search';

export const SettingsScrollView: React.FC<ScrollViewProps> = ({ children, ...rest }) => {
  // React detaches the outgoing panel's ref (calling this with null) before it
  // attaches the incoming one, so the switch lands in the right order. An
  // unmount effect clearing the scroller would not: passive cleanup runs after
  // the new panel has already registered, and would blank it again.
  const attach = useCallback((node: ScrollView | null) => {
    setSettingsScroller(node);
  }, []);

  return (
    <ScrollView ref={attach} {...rest}>
      {children}
    </ScrollView>
  );
};

export const SettingsAnchor: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const glow = useRef(new Animated.Value(0)).current;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => registerSettingsAnchor(id, e.nativeEvent.layout.y),
    [id],
  );

  useEffect(() => () => unregisterSettingsAnchor(id), [id]);

  useEffect(() => {
    const run = (highlight: ReturnType<typeof getSettingsHighlight>) => {
      if (highlight?.anchor !== id) {
        glow.stopAnimation();
        glow.setValue(0);
        return;
      }
      glow.setValue(0);
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.35, duration: 320, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 1, duration: 320, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]).start();
    };
    run(getSettingsHighlight());
    return subscribeSettingsHighlight(run);
  }, [glow, id]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={{
        borderRadius: 18,
        // Colour interpolation cannot run on the native driver; the animation
        // is one short pulse, so the JS-driven frames are not a cost worth
        // designing around.
        backgroundColor: glow.interpolate({
          inputRange: [0, 1],
          outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)'],
        }),
      }}
    >
      {children}
    </Animated.View>
  );
};
