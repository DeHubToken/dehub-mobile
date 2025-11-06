import React from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import { Image } from "expo-image";

const BANNER = require("../../assets/banner.png");

type DpayLoaderProps = {
  minDurationMs?: number;
  onMinDuration?: () => void;
};

// Full-screen splash loader that gently pulses the banner logo
const DpayLoader: React.FC<DpayLoaderProps> = ({ minDurationMs = 700, onMinDuration }) => {
  const scale = React.useRef(new Animated.Value(0.6)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.68,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    let timer: NodeJS.Timeout | undefined;
    if (onMinDuration) {
      timer = setTimeout(onMinDuration, minDurationMs);
    }

    return () => {
      loop.stop();
      if (timer) clearTimeout(timer);
    };
  }, [scale, minDurationMs, onMinDuration]);

  return (
    <View style={styles.container} className="flex-1 bg-theme-neutrals-900 items-center justify-center">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image
          source={BANNER}
          contentFit="contain"
          style={{ width: 240, height: 52 }}
          transition={150}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
  },
});

export default DpayLoader;
