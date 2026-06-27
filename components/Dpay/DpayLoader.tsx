import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import { Image } from "expo-image";

const BANNER = require("../../assets/banner.png");

interface DpayLoaderProps {
  progress?: number; // 0..1, if undefined we show indeterminate animation
}

// Simple pulsing banner loader + optional top progress bar
const DpayLoader: React.FC<DpayLoaderProps> = ({ progress }) => {
  const scale = React.useRef(new Animated.Value(0.6)).current;
  const barAnim = React.useRef(new Animated.Value(0)).current;

  // Banner pulse
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
    return () => { loop.stop(); };
  }, [scale]);

  // Progress bar: animate width when explicit progress provided; otherwise run indeterminate cycle
  React.useEffect(() => {
    if (typeof progress === 'number') {
      // Clamp & animate to new progress
      Animated.timing(barAnim, {
        toValue: Math.min(1, Math.max(0, progress)),
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    } else {
      // Indeterminate loop (web-style)
      const indeterminate = () => {
        barAnim.setValue(0);
        Animated.sequence([
          Animated.timing(barAnim, {
            toValue: 0.6,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(barAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
        ]).start(({ finished }) => finished && indeterminate());
      };
      indeterminate();
    }
  }, [progress, barAnim]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container} className="flex-1 bg-theme-neutrals-900 items-center justify-center">
      <View style={styles.progressTrack} className="absolute top-0 left-0 right-0 h-[3px] bg-theme-neutrals-800 overflow-hidden">
        <Animated.View
          style={[styles.progressFill, { width: barWidth }]}
          className="h-full bg-theme-accent"
        />
      </View>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={BANNER} contentFit="contain" style={{ width: 240, height: 52 }} transition={150} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  progressFill: {
    height: '100%',
  },
});

export default DpayLoader;
