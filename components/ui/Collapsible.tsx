/**
 * A section that opens and closes by growing and shrinking to its own
 * height, instead of popping in and out. Used wherever a row with a chevron
 * shows more beneath it. Timings come from theme/motion.
 */
import React, { useEffect, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Icon from "./Icon";
import { MOTION } from "../../theme/motion";

export function Collapsible({ open, children, style }: { open: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useSharedValue(open ? 1 : 0);
  const height = useSharedValue(0);
  // Children leave the tree once the close has finished, as they did before.
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) setRendered(true);
    progress.value = withTiming(
      open ? 1 : 0,
      { duration: open ? MOTION.open : MOTION.close, easing: open ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic) },
      (done) => {
        if (done && !open) runOnJS(setRendered)(false);
      },
    );
  }, [open, progress]);

  const animated = useAnimatedStyle(() => ({
    height: height.value * progress.value,
    opacity: Math.min(1, progress.value * 1.6),
  }));

  if (!rendered) return null;
  // The content is measured out of flow (absolute), so a zero-height box can
  // never squash it to 0 and leave the section stuck shut. That happened on
  // iOS: the chevron turned but nothing opened.
  return (
    <Animated.View style={[{ overflow: "hidden" }, animated]} pointerEvents={open ? "auto" : "none"}>
      <Animated.View
        style={[{ position: "absolute", top: 0, left: 0, right: 0 }, style]}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height;
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** A down chevron that turns to point up while its section is open. */
export function CollapsibleChevron({ open, size = 16, color }: { open: boolean; size?: number; color: string }) {
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: MOTION.open, easing: Easing.out(Easing.cubic) });
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="ChevronDown" size={size} color={color} />
    </Animated.View>
  );
}
