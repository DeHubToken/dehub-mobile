import React, {
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { View, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";

// Constants
const BUTTON_WIDTH = 262;
const BUTTON_HEIGHT = 90;
const PILL_PADDING = 8;
const ARROW_SIZE = BUTTON_HEIGHT - PILL_PADDING * 2; // Arrow fits inside pill with padding
const PILL_BG_COLOR = "#FFFFFF1A";
const TEXT_COLOR = "#9CA3AF";
const ACCENT_GRADIENT = ["#b9d6f7", "#256DFA"] as const;

export interface SwipeButtonRef {
  setProgress: (progress: number) => void;
  triggerComplete: () => void;
  reset: () => void;
}

interface SwipeButtonProps {
  onComplete?: () => void;
}

const SwipeButton = forwardRef<SwipeButtonRef, SwipeButtonProps>(
  ({ onComplete }, ref) => {
    // Animation values
    const swipeProgress = useSharedValue(0); // 0 to 1
    const isPressed = useSharedValue(0); // 0 or 1
    const isComplete = useSharedValue(0); // 0 or 1
    const expandProgress = useSharedValue(0); // 0 to 1 for fill expansion
    const showConfettiIcon = useSharedValue(0); // 0 or 1

    const maxSwipeDistance = BUTTON_WIDTH - ARROW_SIZE - PILL_PADDING * 2;

    // Callback to handle navigation after animation
    const handleNavigate = useCallback(() => {
      setTimeout(() => {
        onComplete?.();
      }, 600);
    }, [onComplete]);

    // Animated styles for the arrow button
    const arrowButtonStyle = useAnimatedStyle(() => {
      const translateX = interpolate(
        swipeProgress.value,
        [0, 1],
        [0, maxSwipeDistance],
        Extrapolation.CLAMP
      );

      // When expanding, grow width from arrow size to full pill width
      const expandedWidth = interpolate(
        expandProgress.value,
        [0, 1],
        [ARROW_SIZE, BUTTON_WIDTH],
        Extrapolation.CLAMP
      );

      const expandedHeight = interpolate(
        expandProgress.value,
        [0, 1],
        [ARROW_SIZE, BUTTON_HEIGHT],
        Extrapolation.CLAMP
      );

      // When expanding from right position:
      // - Start at maxSwipeDistance (right side, inside padding)
      // - End at -PILL_PADDING (to cover the full pill from left edge)
      // The button expands leftward, so we subtract the width increase
      const widthIncrease = expandedWidth - ARROW_SIZE;
      // When at rest (expandProgress=0): translateX = maxSwipeDistance
      // When fully expanded (expandProgress=1): translateX = -PILL_PADDING
      const expandTranslateX = interpolate(
        expandProgress.value,
        [0, 1],
        [maxSwipeDistance, -PILL_PADDING],
        Extrapolation.CLAMP
      );

      return {
        transform: [
          { translateX: isComplete.value === 1 ? expandTranslateX : translateX },
        ],
        width: expandedWidth,
        height: expandedHeight,
        borderRadius: interpolate(
          expandProgress.value,
          [0, 1],
          [ARROW_SIZE / 2, BUTTON_HEIGHT / 2],
          Extrapolation.CLAMP
        ),
      };
    });

    // Arrow button inner background (dark when idle)
    const innerBgStyle = useAnimatedStyle(() => ({
      opacity: isPressed.value || swipeProgress.value > 0 || isComplete.value ? 0 : 1,
    }));

    // Gradient visibility (shown when pressed or swiping)
    const gradientStyle = useAnimatedStyle(() => ({
      opacity: isPressed.value || swipeProgress.value > 0 || isComplete.value ? 1 : 0,
    }));

    // Arrow icon style (fades out on complete)
    const arrowStyle = useAnimatedStyle(() => ({
      opacity: interpolate(isComplete.value, [0, 0.5], [1, 0]),
    }));

    // Tick icon style (fades in on complete, then fades out when confetti shows)
    const tickStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        isComplete.value,
        [0.3, 0.8],
        [0, 1],
        Extrapolation.CLAMP
      ) * (1 - showConfettiIcon.value),
    }));

    // Confetti icon style (fades in after expansion)
    const confettiIconStyle = useAnimatedStyle(() => ({
      opacity: showConfettiIcon.value,
      transform: [
        { scale: interpolate(showConfettiIcon.value, [0, 1], [0.5, 1]) },
      ],
    }));

    // Text fade out when swiping/complete
    const textStyle = useAnimatedStyle(() => ({
      opacity: interpolate(
        Math.max(swipeProgress.value, expandProgress.value),
        [0, 0.3],
        [1, 0],
        Extrapolation.CLAMP
      ),
    }));

    useImperativeHandle(ref, () => ({
      setProgress: (progress: number) => {
        swipeProgress.value = Math.min(1, Math.max(0, progress));
        if (progress > 0) {
          isPressed.value = 1;
        }
      },
      triggerComplete: () => {
        // First: arrow moves to end and changes to tick
        isComplete.value = withTiming(1, { duration: 200 });
        swipeProgress.value = withTiming(1, { duration: 200 });

        // Then: expand to fill the pill (longer delay so user sees checkmark)
        expandProgress.value = withDelay(
          600, // Wait 600ms so user can see the checkmark
          withTiming(1, { duration: 400 }, (finished) => {
            if (finished) {
              // Show confetti icon after expansion
              showConfettiIcon.value = withTiming(1, { duration: 200 }, (done) => {
                if (done) {
                  // Navigate after showing confetti icon
                  runOnJS(handleNavigate)();
                }
              });
            }
          })
        );
      },
      reset: () => {
        swipeProgress.value = withTiming(0, { duration: 200 });
        isPressed.value = 0;
        isComplete.value = 0;
        expandProgress.value = 0;
        showConfettiIcon.value = 0;
      },
    }));

    return (
      <View style={styles.container}>
        {/* Background pill */}
        <View style={styles.pill}>
          {/* Arrow button */}
          <Animated.View style={[styles.arrowButton, arrowButtonStyle]}>
            {/* Dark background (visible when idle) */}
            <Animated.View style={[styles.innerBg, innerBgStyle]} />

            {/* Gradient background (visible when pressed/swiping/complete) */}
            <Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
              <LinearGradient
                colors={ACCENT_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradient}
              />
            </Animated.View>

            {/* Arrow icon */}
            <Animated.View style={[styles.iconContainer, arrowStyle]}>
              <Ionicons name="arrow-forward" size={36} color="#1C1B1F" />
            </Animated.View>

            {/* Tick icon (shown on complete) */}
            <Animated.View style={[styles.iconContainer, tickStyle]}>
              <Ionicons name="checkmark" size={28} color="#fff" />
            </Animated.View>

            {/* Confetti/Party popper icon (shown after expansion) */}
            <Animated.View style={[styles.iconContainer, confettiIconStyle]}>
              <MaterialCommunityIcons name="party-popper" size={32} color="#fff" />
            </Animated.View>
          </Animated.View>

          {/* Text label */}
          <Animated.View style={[styles.textContainer, textStyle]}>
            <Text style={styles.text}>Swipe to start</Text>
          </Animated.View>
        </View>
      </View>
    );
  }
);

SwipeButton.displayName = "SwipeButton";

const styles = StyleSheet.create({
  container: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  pill: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    backgroundColor: PILL_BG_COLOR,
    borderRadius: BUTTON_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PILL_PADDING,
  },
  arrowButton: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    zIndex: 2,
  },
  innerBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#6F7174",
    borderRadius: ARROW_SIZE / 2,
  },
  gradient: {
    flex: 1,
  },
  iconContainer: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    // marginLeft: 6,
},
text: {
    color: TEXT_COLOR,
    fontSize: 20,
    fontWeight: "500",
    marginRight: 6,
  },
});

export default SwipeButton;

