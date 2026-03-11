import React, { useCallback, useRef } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { icons } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { colors } from "../../theme/colors";
import GlassIndicator, { GLASS_SHADOW } from "./GlassIndicator";

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  gradient?: string[];
  tooltip?: string;
  glass?: boolean;
  glassBorderRadius?: number;
  glassPadding?: number;
  onPress?: () => void;
  onLongPress?: () => void;
}

const TOOLTIP_SHOW_DURATION = 1500;
const LONG_PRESS_DELAY = 400;

const Icon: React.FC<IconProps> = ({
  name,
  size = 24,
  color = colors.foreground,
  strokeWidth = 2,
  fill,
  gradient,
  tooltip,
  glass = false,
  glassBorderRadius = 12,
  glassPadding = 10,
  onPress,
  onLongPress,
}) => {
  const LucideIcon = icons[name];
  const tooltipOpacity = useSharedValue(0);

  if (!LucideIcon) {
    if (__DEV__) console.warn(`[Icon] "${name}" not found in lucide-react-native`);
    return <View style={{ width: size, height: size }} />;
  }

  const iconElement = gradient && gradient.length >= 2 ? (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <LucideIcon size={size} color="#fff" strokeWidth={strokeWidth} />
      }
    >
      <LinearGradient
        style={{ flex: 1 }}
        colors={gradient as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </MaskedView>
  ) : (
    <LucideIcon size={size} color={color} strokeWidth={strokeWidth} fill={fill || "none"} />
  );

  const isInteractive = !!(tooltip || onPress || onLongPress);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      onLongPress();
      return;
    }
    if (tooltip) {
      tooltipOpacity.value = withTiming(1, { duration: 150 });
      tooltipOpacity.value = withDelay(
        TOOLTIP_SHOW_DURATION,
        withTiming(0, { duration: 200 }),
      );
    }
  }, [onLongPress, tooltip, tooltipOpacity]);

  const tooltipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tooltipOpacity.value,
  }));

  const tooltipElement = tooltip ? (
    <Animated.View
      style={[styles.tooltipContainer, tooltipAnimatedStyle]}
      pointerEvents="none"
    >
      <View style={styles.tooltipBubble}>
        <Text style={styles.tooltipText}>{tooltip}</Text>
      </View>
      <View style={styles.tooltipArrow} />
    </Animated.View>
  ) : null;

  if (glass) {
    const containerSize = size + glassPadding * 2;
    if (isInteractive) {
      return (
        <Pressable
          onPress={onPress}
          onLongPress={(tooltip || onLongPress) ? handleLongPress : undefined}
          delayLongPress={LONG_PRESS_DELAY}
          style={[
            styles.glassContainer,
            {
              width: containerSize,
              height: containerSize,
              borderRadius: glassBorderRadius,
            },
            GLASS_SHADOW,
          ]}
        >
          <GlassIndicator borderRadius={glassBorderRadius} />
          {iconElement}
          {tooltipElement}
        </Pressable>
      );
    }
    return (
      <View
        style={[
          styles.glassContainer,
          {
            width: containerSize,
            height: containerSize,
            borderRadius: glassBorderRadius,
          },
          GLASS_SHADOW,
        ]}
      >
        <GlassIndicator borderRadius={glassBorderRadius} />
        {iconElement}
        {tooltipElement}
      </View>
    );
  }

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={(tooltip || onLongPress) ? handleLongPress : undefined}
        delayLongPress={LONG_PRESS_DELAY}
      >
        {iconElement}
        {tooltipElement}
      </Pressable>
    );
  }

  return iconElement;
};

const styles = StyleSheet.create({
  glassContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  tooltipContainer: {
    position: "absolute",
    bottom: "110%",
    left: "50%",
    transform: [{ translateX: "-50%" }],
    alignItems: "center",
    zIndex: 9999,
  },
  tooltipBubble: {
    backgroundColor: "#1F2937",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tooltipText: {
    color: "#F3F4F6",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1F2937",
  },
});

export default Icon;
