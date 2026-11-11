import React, { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { useAppTheme } from "../../context/ThemeContext";
import { KeepDarkScope } from "../../libs/jsx/tone";

type CustomSwitchProps = {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  /** What the switch controls. Without it a screen reader says only "switch, on". */
  accessibilityLabel?: string;
};

const TRACK_W = 46;
const TRACK_H = 28;
const THUMB_SIZE = 22;
const THUMB_MARGIN = 3;
const TRAVEL = TRACK_W - THUMB_SIZE - THUMB_MARGIN * 2;

function isPale(color: string): boolean {
  const hex = /^#([\da-f]{6})$/i.exec(color);
  if (!hex) return /^(?:white|#fff)$/i.test(color);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200;
}

const CustomSwitch: React.FC<CustomSwitchProps> = ({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}) => {
  // Animated styles never pass through the JSX colour pass (libs/jsx/tone.js),
  // so System Light's colours are picked here.
  const { colors, pageColors, isLight } = useAppTheme();
  const offTrack = isLight ? '#A1A1AA' : colors.neutrals[800];
  const offThumb = isLight ? '#FFFFFF' : colors.accentSecondary;
  // System's accent is white; on a light page that track vanishes, so it
  // turns to ink there with a white thumb.
  const paleAccent = isLight && isPale(pageColors.accent);
  const onTrack = paleAccent ? '#18181B' : pageColors.accent;
  const onThumb = paleAccent ? '#FFFFFF' : pageColors.accentForeground;
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 200 });
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [offTrack, onTrack],
    ),
  }), [offTrack, onTrack]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [offThumb, onThumb],
    ),
  }), [offThumb, onThumb]);

  const handlePress = () => {
    if (!disabled) onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={disabled ? { opacity: 0.5 } : undefined}
    >
      {/* The resting colours and position are drawn plainly too. On iPhone an
          animated style can miss its first frame on a switch mounted below the
          fold (Settings > Notifications), and the switch was then drawn with
          no colour at all: an invisible track and thumb. KeepDarkScope keeps
          System Light's colour pass off these exact colours. */}
      <KeepDarkScope>
        <Animated.View style={[styles.track, { backgroundColor: value ? onTrack : offTrack }, trackStyle]}>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: value ? onThumb : offThumb, transform: [{ translateX: value ? TRAVEL : 0 }] },
              thumbStyle,
            ]}
          />
        </Animated.View>
      </KeepDarkScope>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: "center",
    paddingHorizontal: THUMB_MARGIN,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});

export default React.memo(CustomSwitch);
