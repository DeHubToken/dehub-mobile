import React from "react";
import { View, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, SharedValue } from "react-native-reanimated";

interface ProgressPillProps {
  index: number;
  activeIndex: SharedValue<number>;
  progress: SharedValue<number>;
}

const ProgressPill: React.FC<ProgressPillProps> = ({ index, activeIndex, progress }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = Math.round(activeIndex.value) === index;
    const isPast = Math.round(activeIndex.value) > index;
    
    let fillWidth: string;
    if (isPast) {
      fillWidth = "100%";
    } else if (isActive) {
      fillWidth = `${progress.value * 100}%`;
    } else {
      fillWidth = "0%";
    }

    return {
      width: fillWidth,
    };
  });

  return (
    <View style={styles.pillContainer}>
      <View style={styles.pillBackground} />
      <Animated.View style={[styles.pillFill, animatedStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  pillContainer: {
    width: 47,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 4,
  },
  pillFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderRadius: 4,
  },
});

export default ProgressPill;
