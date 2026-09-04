import React, { useEffect, useRef } from "react";
import { Animated, Easing, ViewStyle } from "react-native";

interface SpinnerProps {
  size?: number;
  /** The moving arc. */
  color?: string;
  /** The ring it travels around. */
  trackColor?: string;
  thickness?: number;
  style?: ViewStyle;
}

/**
 * A ring that actually turns.
 *
 * The feed player drew its loading indicator as a plain `View` with a lighter
 * top border — a frozen arc that never moved. A still spinner reads as a hung
 * app rather than a loading one, which is most of why waiting for a video to
 * start looked broken instead of busy.
 *
 * Rotation runs on the native driver, so it keeps turning at 60fps even while
 * the JS thread is busy decoding the feed — exactly when it is on screen.
 */
const Spinner: React.FC<SpinnerProps> = ({
  size = 28,
  color = "#fff",
  trackColor = "rgba(255,255,255,0.28)",
  thickness = 2,
  style,
}) => {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 750,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: trackColor,
          borderTopColor: color,
          transform: [{ rotate }],
        },
        style,
      ]}
    />
  );
};

export default React.memo(Spinner);
