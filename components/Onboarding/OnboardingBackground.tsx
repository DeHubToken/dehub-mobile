import React from "react";
import { StyleSheet, View } from "react-native";
import { Fit, RiveView, useRiveFile } from "@rive-app/react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  SharedValue,
} from "react-native-reanimated";

// Placeholder: using cards.riv for all slides, replace with actual files later
const SLIDE_ANIMATIONS = [
  require("../../assets/riv/card_01.riv"),
  require("../../assets/riv/card_02.riv"),
  require("../../assets/riv/card_03.riv"),
];

interface OnboardingBackgroundProps {
  activeIndex: SharedValue<number>;
  totalSlides: number;
}

const OnboardingBackground: React.FC<OnboardingBackgroundProps> = ({
  activeIndex,
  totalSlides,
}) => {
  return (
    <View style={styles.container}>
      {SLIDE_ANIMATIONS.slice(0, totalSlides).map((_, index) => (
        <SlideBackground
          key={index}
          index={index}
          activeIndex={activeIndex}
        />
      ))}
    </View>
  );
};

interface SlideBackgroundProps {
  index: number;
  activeIndex: SharedValue<number>;
}

const SlideBackground: React.FC<SlideBackgroundProps> = ({ index, activeIndex }) => {
  const { riveFile } = useRiveFile(SLIDE_ANIMATIONS[index]);

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = Math.round(activeIndex.value) === index;
    return {
      opacity: withTiming(isActive ? 1 : 0, { duration: 400 }),
    };
  });

  if (!riveFile) {
    return null;
  }

  return (
    <Animated.View style={[styles.slideContainer, animatedStyle]}>
      <RiveView
        file={riveFile}
        autoPlay={true}
        style={styles.rive}
        fit={Fit.Cover}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  slideContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  rive: {
    width: "100%",
    height: "100%",
  },
});

export default OnboardingBackground;
