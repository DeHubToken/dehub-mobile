import React from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, withTiming, SharedValue } from "react-native-reanimated";

export interface StorySlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
}

interface SlideTextProps {
  slide: StorySlide;
  index: number;
  activeIndex: SharedValue<number>;
}

const SlideText: React.FC<SlideTextProps> = ({ slide, index, activeIndex }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = Math.round(activeIndex.value) === index;
    return {
      opacity: withTiming(isActive ? 1 : 0, { duration: 300 }),
      transform: [
        { translateY: withTiming(isActive ? 0 : 20, { duration: 300 }) },
      ],
      position: "absolute" as const,
      width: "100%",
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.subtitle}>{slide.subtitle}</Text>
      <Text style={styles.description}>{slide.description}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
});

export default SlideText;
