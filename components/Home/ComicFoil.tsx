import React, { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { BorderLook } from "../../libs/comic-borders";

/**
 * The foil behind a comic card's face, which shows as the strip round it: the
 * theme's gradient, or a border preset with its texture (libs/comic-borders).
 *
 * Holographic drifts and glitter twinkles, each through one transform or
 * opacity on the UI thread, and only while `animate` is on (the card is on
 * screen) and the system allows motion.
 */
function ComicFoil({ colors, look, width, height, animate = false }: {
  /** The theme's gradient, used when there is no preset. */
  colors: string[];
  look?: BorderLook;
  width: number;
  height: number;
  animate?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const moving = !!look && animate && !reduceMotion && (!!look.drift || look.texture === "glitter");
  const duration = look?.drift ? 7000 : 1600;
  const t = useSharedValue(0);

  useEffect(() => {
    if (!moving) {
      cancelAnimation(t);
      return;
    }
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, true);
    return () => cancelAnimation(t);
  }, [moving, duration, t]);

  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -t.value * width * 2 }] }));
  const twinkleStyle = useAnimatedStyle(() => ({ opacity: 0.2 + 0.8 * t.value }));

  if (!look) {
    return <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />;
  }

  const strip = look.strip as [string, string, ...string[]];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {look.drift ? (
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: width * 3 }, driftStyle]}>
          <LinearGradient colors={strip} start={{ x: 0, y: 0.3 }} end={{ x: 1, y: 0.7 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : (
        <LinearGradient colors={strip} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}

      {look.texture === "carbon" && width > 0 ? (
        <>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id="comic-carbon" width={8} height={8} patternUnits="userSpaceOnUse">
                <Rect width={8} height={8} fill="#141416" />
                <Rect x={0} y={0} width={4} height={4} fill="#28282d" />
                <Rect x={4} y={4} width={4} height={4} fill="#28282d" />
                <Rect x={0} y={0} width={4} height={1.2} fill="#37373d" />
                <Rect x={4} y={4} width={1.2} height={4} fill="#37373d" />
              </Pattern>
            </Defs>
            <Rect width={width} height={height} fill="url(#comic-carbon)" />
          </Svg>
          <LinearGradient
            colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : null}

      {look.texture === "glitter" && width > 0 ? (
        <>
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id="comic-flakes" width={9} height={8} patternUnits="userSpaceOnUse">
                <Circle cx={1.5} cy={1.5} r={0.8} fill="#ffffff" />
                <Circle cx={6} cy={4.5} r={0.7} fill="#ffc8f5" />
                <Circle cx={3.5} cy={6.5} r={0.7} fill="#b9e4ff" />
              </Pattern>
            </Defs>
            <Rect width={width} height={height} fill="url(#comic-flakes)" />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, twinkleStyle]}>
            <Svg width={width} height={height}>
              <Defs>
                <Pattern id="comic-sparks" width={13} height={11} patternUnits="userSpaceOnUse">
                  <Circle cx={2} cy={3} r={1.1} fill="#ffffff" />
                  <Circle cx={8.5} cy={8} r={1} fill="#ffffff" />
                </Pattern>
              </Defs>
              <Rect width={width} height={height} fill="url(#comic-sparks)" />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

export default memo(ComicFoil);
