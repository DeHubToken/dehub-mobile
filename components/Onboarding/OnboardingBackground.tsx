import React, { useEffect } from "react";
import { ImageBackground, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const ARTWORK = [
  require("../../assets/onboarding/globe.png"),
  require("../../assets/onboarding/thumb.png"),
  require("../../assets/onboarding/coin.png"),
];

interface OnboardingBackgroundProps {
  activeIndex: SharedValue<number>;
  totalSlides: number;
}

const OnboardingBackground: React.FC<OnboardingBackgroundProps> = ({
  activeIndex,
  totalSlides,
}) => {
  const { width, height } = useWindowDimensions();
  const size = Math.min(260, width * 0.65, height * 0.3);
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
    <ImageBackground
      source={require("../../assets/onboarding/background.jpg")}
      style={styles.container}
      resizeMode="cover"
      accessible={false}
    >
      <View style={styles.scrim} />
      <View style={[styles.artwork, { top: height * 0.15, width: size, height: size }]}>
      {ARTWORK.slice(0, totalSlides).map((source, index) => (
        <SlideArtwork
          key={index}
          source={source}
          index={index}
          activeIndex={activeIndex}
        />
      ))}
      </View>
    </ImageBackground>
    </View>
  );
};

interface SlideArtworkProps {
  source: number;
  index: number;
  activeIndex: SharedValue<number>;
}

const SlideArtwork: React.FC<SlideArtworkProps> = ({ source, index, activeIndex }) => {
  const reducedMotion = useReducedMotion();
  const hover = useSharedValue(reducedMotion ? 0 : 8);
  useEffect(() => {
    hover.value = reducedMotion ? 0 : 8;
    if (!reducedMotion) {
      hover.value = withRepeat(withTiming(-8, {
        duration: 1900,
        easing: Easing.inOut(Easing.sin),
      }), -1, true);
    }
    return () => cancelAnimation(hover);
  }, [hover, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => {
    const isActive = Math.round(activeIndex.value) === index;
    return {
      opacity: withTiming(isActive ? 1 : 0, { duration: reducedMotion ? 0 : 300 }),
      transform: [{ translateY: hover.value }],
    };
  });

  return (
    <Animated.View style={[styles.slideContainer, animatedStyle]}>
      <Animated.Image source={source} resizeMode="contain" style={styles.image} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    alignItems: "center",
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  artwork: { position: "absolute" },
  slideContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

export default OnboardingBackground;
