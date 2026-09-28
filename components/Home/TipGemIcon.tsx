/**
 * The tip button's gem. Plain outline until this viewer tips, then the moving
 * Noto 💎 (the same animated emoji a reaction you cast plays), which swirls in
 * and throws a ring of sparkles on each fresh tip —
 * the same acknowledgement a reaction gets, so a tip never lands silently.
 */
import React, { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Icon from "../ui/Icon";

const GEM_FILL = "#22D3EE";
const GEM_STROKE = "#A5F3FC";

const SPARKLES = [0, 60, 120, 180, 240, 300].map((angle, i) => {
  const r = (angle * Math.PI) / 180;
  const d = i % 2 ? 16 : 21;
  return { x: Math.cos(r) * d, y: Math.sin(r) * d, size: i % 2 ? 7 : 9 };
});

export function TipGemIcon({ tipped, burstKey, size, color }: { tipped: boolean; burstKey: number; size: number; color: string }) {
  const spin = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(1)).current;
  const [failed, setFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); }, []);

  useEffect(() => {
    if (!burstKey) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      spin.setValue(0);
      burst.setValue(0);
      Animated.parallel([
        Animated.timing(spin, { toValue: 1, duration: 750, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 900, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
    return () => { cancelled = true; };
  }, [burstKey, spin, burst]);

  if (!tipped) return <Icon name="Gem" size={size} color={color} strokeWidth={1.8} />;

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["-200deg", "0deg"] });
  const scale = spin.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        {reduceMotion || failed ? (
          <Icon name="Gem" size={size} color={GEM_STROKE} fill={GEM_FILL} strokeWidth={1.8} />
        ) : (
          // The same moving Noto emoji a reaction you cast plays (ReactionEmoji).
          <Image
            source={require("../../assets/emoji/animated/gem.webp")}
            style={{ width: size + 4, height: size + 4 }}
            contentFit="contain"
            autoplay
            accessible={false}
            onError={() => setFailed(true)}
          />
        )}
      </Animated.View>
      {SPARKLES.map((s, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            opacity: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
            transform: [
              // Curve outward while turning, so the ring reads as a swirl.
              { translateX: burst.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, s.y * 0.6, s.x] }) },
              { translateY: burst.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -s.x * 0.6, s.y] }) },
              { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
              { scale: burst.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1.2, 0.4] }) },
            ],
          }}
        >
          <Icon name="Sparkles" size={s.size} color={GEM_STROKE} fill={GEM_STROKE} strokeWidth={1.5} />
        </Animated.View>
      ))}
    </View>
  );
}
