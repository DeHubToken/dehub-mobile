/**
 * Emperor Thumb
 * =============
 * Your own 👍 (or 👎) on a post, played as the arena verdict: a closed fist
 * held out sideways, the thumb slowly coming out and pointing up (or down),
 * held with one small pulse, then drawn back into the fist, a rest, and again.
 * One 7s cycle, the same drawing and timing as web's EmperorThumb.
 *
 * Drawn rather than an emoji so the thumb can really come out of the fist: the
 * thumb is its own layer turning on its base. Native-driver transforms only;
 * it rests on the fist while the card is off screen.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

const SKIN = "#FFC83D";
const EDGE = "#C98500";
const NAIL = "#FFE29A";
const CYCLE_MS = 7000;
/** The thumb's base, in the 32-unit drawing: where it turns. */
const THUMB_ORIGIN = `${(10 / 32) * 100}% ${(14 / 32) * 100}%`;
const HAND_ORIGIN = `50% ${(20 / 32) * 100}%`;

export function EmperorThumb({ size, down = false, playing = true }: { size: number; down?: boolean; playing?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!playing) return;
    t.setValue(0);
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: true, isInteraction: false }),
    );
    loop.start();
    return () => {
      loop.stop();
      t.setValue(0);
    };
  }, [playing, t]);

  const thumbStyle = useMemo(() => ({
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: size,
    height: size,
    transformOrigin: THUMB_ORIGIN,
    transform: [{
      rotate: t.interpolate({
        inputRange: [0, 0.14, 0.3, 0.58, 0.72, 1],
        outputRange: ["90deg", "90deg", "0deg", "0deg", "90deg", "90deg"],
        easing: Easing.inOut(Easing.ease),
      }),
    }],
  }), [size, t]);

  const handStyle = useMemo(() => ({
    width: size,
    height: size,
    transformOrigin: HAND_ORIGIN,
    transform: [
      ...(down ? [{ scaleY: -1 }] : []),
      { scale: t.interpolate({ inputRange: [0, 0.34, 0.39, 0.44, 1], outputRange: [1, 1, 1.07, 1, 1] }) },
    ],
  }), [down, size, t]);

  return (
    <Animated.View style={handStyle} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Rect x={6} y={13} width={20} height={14} rx={5} fill={SKIN} stroke={EDGE} strokeWidth={1.4} />
        <Path d="M18.5 16.6h6M18.5 20h6.6M18.5 23.4h6" stroke={EDGE} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      </Svg>
      <Animated.View style={thumbStyle}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size} viewBox="0 0 32 32">
            <Rect x={7.25} y={3} width={5.5} height={12} rx={2.75} fill={SKIN} stroke={EDGE} strokeWidth={1.4} />
            <Rect x={8.4} y={4.3} width={3.2} height={3.4} rx={1.4} fill={NAIL} />
          </Svg>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
