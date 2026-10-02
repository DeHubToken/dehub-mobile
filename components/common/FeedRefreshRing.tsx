import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
export default function FeedRefreshRing() {
  const rotation = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { live = false; sub.remove(); };
  }, []);
  useEffect(() => {
    rotation.setValue(0);
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(rotation, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => loop.stop();
  }, [rotation, reduceMotion]);
  return <View pointerEvents="none" style={{ position: "absolute", width: 36, height: 36, left: "50%", top: "50%", marginLeft: -18, marginTop: -18 }}>
    <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
      <Svg width={36} height={36} viewBox="0 0 36 36">
        <Circle cx={18} cy={18} r={16} fill="none" stroke="#FFFFFF" strokeOpacity={0.2} strokeWidth={1.5} />
        <Circle cx={18} cy={18} r={16} fill="none" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" strokeDasharray={[72, 28.531]} rotation={-90} origin="18,18" />
      </Svg>
    </Animated.View>
  </View>;
}
