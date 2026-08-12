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
  useDerivedValue,
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
// rounded-xl, the app's dominant corner and the AUTH_RADIUS every control in
// the sign-in flow this screen hands off to already uses. The outer radius is
// the knob's plus the padding, so the two sets of corners stay concentric.
const KNOB_RADIUS = 12;
const PILL_RADIUS = KNOB_RADIUS + PILL_PADDING;
const PILL_BG_COLOR = "#FFFFFF1A"; // white/10
const TEXT_COLOR = "#9CA3AF"; // gray-400

// Polished chrome, on the brand's #fff -> #6f6f76 silver ramp. The extra stops
// are the specular banding that reads as metal: hotspot, roll-off, a dark
// "horizon" band just past the middle, then a second, softer hotspot. It runs
// diagonally, so the light re-rakes across the fill as the knob opens out into
// the full pill. Matches the chrome 3D icons in the slide backgrounds.
const CHROME_GRADIENT = [
  "#FFFFFF",
  "#DDDFE3",
  "#9A9EA6",
  "#6F6F76",
  "#A8ACB3",
  "#F4F5F7",
  "#8E9299",
] as const;
const CHROME_LOCATIONS = [0, 0.14, 0.33, 0.46, 0.62, 0.82, 1] as const;
// Wet-looking gloss over the top half of the fill.
const CHROME_SHEEN = [
  "rgba(255,255,255,0.55)",
  "rgba(255,255,255,0.06)",
  "rgba(255,255,255,0)",
] as const;
const CHROME_SHEEN_LOCATIONS = [0, 0.35, 0.62] as const;
// Icons sit on bright silver once the fill lands, so they have to go near-black.
const ON_CHROME = "#0B0B0C";
const CHROME_FADE = { duration: 160 } as const;

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
          [KNOB_RADIUS, PILL_RADIUS],
          Extrapolation.CLAMP
        ),
      };
    });

    // Eases to 1 once the chrome fill should be showing (pressed, swiping or
    // complete). Animating here rather than per style keeps it a plain number,
    // so the cross-fades below can multiply it.
    const chromeIn = useDerivedValue(() =>
      withTiming(
        isPressed.value || swipeProgress.value > 0 || isComplete.value ? 1 : 0,
        CHROME_FADE
      )
    );

    // Arrow button inner background (dark when idle)
    const innerBgStyle = useAnimatedStyle(() => ({
      opacity: 1 - chromeIn.value,
    }));

    // Chrome fill visibility (shown when pressed or swiping)
    const gradientStyle = useAnimatedStyle(() => ({
      opacity: chromeIn.value,
    }));

    // Hairline rim that sells the polish; tracks the pill's expanding radius
    const rimStyle = useAnimatedStyle(() => ({
      opacity: chromeIn.value,
      borderRadius: interpolate(
        expandProgress.value,
        [0, 1],
        [KNOB_RADIUS, PILL_RADIUS],
        Extrapolation.CLAMP
      ),
    }));

    // Arrow icon fades out on complete. It is drawn twice — white over the dark
    // idle knob, near-black over the chrome — and cross-faded with the fill.
    const arrowLightStyle = useAnimatedStyle(() => ({
      opacity:
        interpolate(isComplete.value, [0, 0.5], [1, 0], Extrapolation.CLAMP) *
        (1 - chromeIn.value),
    }));

    const arrowDarkStyle = useAnimatedStyle(() => ({
      opacity:
        interpolate(isComplete.value, [0, 0.5], [1, 0], Extrapolation.CLAMP) *
        chromeIn.value,
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

    const triggerComplete = useCallback(() => {
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
    }, [
      handleNavigate,
      isComplete,
      swipeProgress,
      expandProgress,
      showConfettiIcon,
    ]);

    useImperativeHandle(ref, () => ({
      setProgress: (progress: number) => {
        swipeProgress.value = Math.min(1, Math.max(0, progress));
        if (progress > 0) {
          isPressed.value = 1;
        }
      },
      triggerComplete,
      reset: () => {
        swipeProgress.value = withTiming(0, { duration: 200 });
        isPressed.value = 0;
        isComplete.value = 0;
        expandProgress.value = 0;
        showConfettiIcon.value = 0;
      },
    }));

    return (
      <View
        style={styles.container}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Swipe to start"
        onAccessibilityTap={triggerComplete}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate") {
            triggerComplete();
          }
        }}
      >
        <View style={styles.pill}>
          <Animated.View style={[styles.arrowButton, arrowButtonStyle]}>
            {/* Dark background (visible when idle) */}
            <Animated.View style={[styles.innerBg, innerBgStyle]} />

            {/* Chrome fill (visible when pressed/swiping/complete) */}
            <Animated.View style={[StyleSheet.absoluteFill, gradientStyle]}>
              <LinearGradient
                colors={CHROME_GRADIENT}
                locations={CHROME_LOCATIONS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
              />
              <LinearGradient
                colors={CHROME_SHEEN}
                locations={CHROME_SHEEN_LOCATIONS}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </Animated.View>

            {/* Rim highlight around the chrome */}
            <Animated.View
              style={[styles.rim, rimStyle]}
              pointerEvents="none"
            />

            {/* Arrow icon — white on the idle knob, near-black on the chrome */}
            <Animated.View style={[styles.iconContainer, arrowLightStyle]}>
              <Ionicons name="arrow-forward" size={36} color="#FFFFFF" />
            </Animated.View>
            <Animated.View style={[styles.iconContainer, arrowDarkStyle]}>
              <Ionicons name="arrow-forward" size={36} color={ON_CHROME} />
            </Animated.View>

            {/* Tick icon (shown on complete) */}
            <Animated.View style={[styles.iconContainer, tickStyle]}>
              <Ionicons name="checkmark" size={28} color={ON_CHROME} />
            </Animated.View>

            {/* Confetti/Party popper icon (shown after expansion) */}
            <Animated.View style={[styles.iconContainer, confettiIconStyle]}>
              <MaterialCommunityIcons
                name="party-popper"
                size={32}
                color={ON_CHROME}
              />
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
    borderRadius: PILL_RADIUS,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PILL_PADDING,
  },
  arrowButton: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: KNOB_RADIUS,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    zIndex: 2,
  },
  innerBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#52525B",
    borderRadius: KNOB_RADIUS,
  },
  gradient: {
    flex: 1,
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.60)",
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

