import React, { useCallback, useRef, useState } from "react";
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";

const LENS_W = 30;
const LENS_H = 20;

/** Android hands pageX on the event; react-native-web only on its touches. */
const pageXOf = (e: GestureResponderEvent) => e.nativeEvent.pageX ?? e.nativeEvent.touches?.[0]?.pageX ?? 0;

/**
 * Holding a slider turns its handle into a clear glass lens that follows the
 * finger and stretches with drag speed. iPhone gets this for free: on iOS 26
 * the system slider does exactly this while it is held. Android's slider does
 * nothing of the sort, so this draws the same lens over it there and hands
 * `held` to the children so they can hide the native thumb under it. iOS is
 * left with the native effect untouched. Web does the same in
 * dehubweb src/components/app/audio/glass-hold.ts.
 */
export const GlassHold: React.FC<{
  children: React.ReactNode | ((held: boolean) => React.ReactNode);
  style?: StyleProp<ViewStyle>;
}> = ({ children, style }) => {
  const [held, setHeld] = useState(false);
  const ref = useRef<View>(null);
  const width = useRef(0);
  const left = useRef<number | null>(null);
  const last = useRef({ x: 0, t: 0 });
  const grown = useSharedValue(0);
  const x = useSharedValue(0);
  const stretch = useSharedValue(1);

  const place = useCallback((pageX: number) => {
    if (left.current == null) return;
    const w = width.current;
    x.value = Math.max(LENS_W / 2 - 4, Math.min(w - LENS_W / 2 + 4, pageX - left.current));
  }, [x]);

  const press = useCallback((e: GestureResponderEvent) => {
    const pageX = pageXOf(e);
    last.current = { x: pageX, t: Date.now() };
    left.current = null;
    ref.current?.measureInWindow((wx, _wy, ww) => { left.current = wx; if (ww > 0) width.current = ww; place(last.current.x); });
    grown.value = withSpring(1, { damping: 13, stiffness: 260 });
    setHeld(true);
  }, [grown, place]);

  const move = useCallback((e: GestureResponderEvent) => {
    const pageX = pageXOf(e);
    const now = Date.now();
    const speed = Math.abs(pageX - last.current.x) / Math.max(8, now - last.current.t);
    last.current = { x: pageX, t: now };
    place(pageX);
    stretch.value = withSequence(withTiming(1 + Math.min(0.35, speed * 0.25), { duration: 60 }), withTiming(1, { duration: 220 }));
  }, [place, stretch]);

  const release = useCallback(() => {
    grown.value = withTiming(0, { duration: 180 });
    stretch.value = withTiming(1, { duration: 120 });
    setHeld(false);
  }, [grown, stretch]);

  const lens = useAnimatedStyle(() => ({
    opacity: Math.min(1, grown.value * 1.6),
    transform: [
      { translateX: x.value - LENS_W / 2 },
      { scaleX: (0.4 + 0.6 * grown.value) * stretch.value },
      { scaleY: (0.4 + 0.6 * grown.value) * (2 - stretch.value) },
    ],
  }));

  const body = typeof children === "function" ? children(Platform.OS === "ios" ? false : held) : children;
  if (Platform.OS === "ios") return <View style={style}>{body}</View>;

  return (
    <View
      ref={ref}
      style={style}
      onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width; }}
      onTouchStart={press}
      onTouchMove={move}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      {body}
      <Animated.View pointerEvents="none" style={[styles.lens, lens]} />
    </View>
  );
};

const styles = StyleSheet.create({
  lens: {
    position: "absolute",
    left: 0,
    top: "50%",
    width: LENS_W,
    height: LENS_H,
    marginTop: -LENS_H / 2,
    borderRadius: LENS_H / 2,
    backgroundColor: "rgba(255,255,255,0.10)",
    boxShadow: "inset 0px 0px 0px 1px rgba(255,255,255,0.6), inset 0px 1.5px 1px rgba(255,255,255,0.85), inset 0px -1.5px 2px rgba(0,0,0,0.18), 0px 3px 10px rgba(0,0,0,0.28)",
  },
});
