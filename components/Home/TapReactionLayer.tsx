import React, { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import Icon from "../ui/Icon";
import { subscribeTapBursts, type TapBurst } from "../../libs/tap-reaction-layer";
import { TAP_LIKE_ANIMATION_MS, TAP_LOVE_ANIMATION_MS } from "../../libs/tap-gesture";

/** Room the widest burst needs around its centre; taps near an edge slide in. */
const MARGIN = 72;
const SIZE = 64;

const LOVE_BLOOM = [
  { x: -14, y: -54, size: 14 },
  { x: -44, y: -30, size: 10 },
  { x: 38, y: -34, size: 11 },
  { x: -50, y: 2, size: 8 },
  { x: 46, y: 4, size: 9 },
] as const;

type Live = TapBurst & { id: number };

const keepInside = (value: number, extent: number) =>
  extent < MARGIN * 2 ? extent / 2 : Math.min(extent - MARGIN, Math.max(MARGIN, value));

/**
 * Root-level renderer for tap reactions (see libs/tap-reaction-layer). Mounted
 * once beside the navigator, so a burst draws over the card edge, the video's
 * controls and the top pill. Native modals and sheets are their own windows
 * and still sit above it. Nothing here takes touches.
 */
function TapReactionLayer() {
  const [bursts, setBursts] = useState<Live[]>([]);
  const nextId = useRef(0);
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => subscribeTapBursts((burst) => {
    const id = nextId.current++;
    setBursts((current) => [
      // Love replaces the thumb still in flight from the same gesture.
      ...(burst.reaction === "love" ? current.filter((b) => b.reaction !== "like") : current),
      { ...burst, id },
    ]);
  }), []);

  if (!bursts.length) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]}>
      {bursts.map((burst) => (
        <BurstView
          key={burst.id}
          burst={burst}
          x={keepInside(burst.x, width)}
          y={keepInside(burst.y, height)}
          reduceMotion={reduceMotion}
          onDone={() => setBursts((current) => current.filter((b) => b.id !== burst.id))}
        />
      ))}
    </View>
  );
}

const BurstView = memo(function BurstView({ burst, x, y, reduceMotion, onDone }: {
  burst: Live; x: number; y: number; reduceMotion: boolean; onDone: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const love = burst.reaction === "love";

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 700 : love ? TAP_LOVE_ANIMATION_MS : TAP_LIKE_ANIMATION_MS,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    animation.start(() => onDone());
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const opacity = progress.interpolate({ inputRange: [0, 0.18, 0.68, 1], outputRange: [1, 1, 0.96, 0] });
  return (
    <View style={{ position: "absolute", left: x - SIZE / 2, top: y - SIZE / 2, width: SIZE, height: SIZE }}>
      <Animated.View
        style={{
          position: "absolute",
          width: SIZE,
          height: SIZE,
          alignItems: "center",
          justifyContent: "center",
          opacity,
          transform: reduceMotion ? [] : [
            { perspective: 600 },
            // A small lift toward the viewer, so the thumb reads as rising out
            // of the post rather than printed on it.
            { translateY: progress.interpolate({ inputRange: [0, 0.2, 0.68, 1], outputRange: [6, 0, -2, -14] }) },
            { rotateX: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: ["18deg", "0deg", "-4deg"] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.2, 0.42, 1], outputRange: [0.76, 1.1, 1, 0.92] }) },
          ],
        }}
      >
        <Icon
          name={love ? "Heart" : "ThumbsUp"}
          size={love ? 72 : 64}
          color={love ? "#F43F5E" : "#0EA5E9"}
          fill={love ? "#F43F5E" : "#0EA5E9"}
        />
      </Animated.View>
      {love && !reduceMotion && LOVE_BLOOM.map((spark, index) => (
        <Animated.View
          key={index}
          style={{
            position: "absolute",
            left: SIZE / 2 - spark.size / 2,
            top: SIZE / 2 - spark.size / 2,
            opacity: progress.interpolate({ inputRange: [0, 0.16, 0.72, 1], outputRange: [0, 0.9, 0.72, 0] }),
            transform: [
              { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, spark.x] }) },
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, spark.y] }) },
              { scale: progress.interpolate({ inputRange: [0, 0.24, 1], outputRange: [0.55, 1, 0.7] }) },
            ],
          }}
        >
          <Icon name="Heart" size={spark.size} color="#FB7185" fill="#FB7185" />
        </Animated.View>
      ))}
    </View>
  );
});

export default memo(TapReactionLayer);
