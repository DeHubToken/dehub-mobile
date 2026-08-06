import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Pressable,
  Text,
  StyleSheet,
  Platform,
  Modal,
  Dimensions,
  findNodeHandle,
} from "react-native";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { icons } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
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
  /** Screen-reader label for interactive icons; falls back to the tooltip text. */
  accessibilityLabel?: string;
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
  accessibilityLabel,
}) => {
  const LucideIcon = icons[name];
  const iconRef = useRef<View>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const showTooltip = useCallback(() => {
    if (!tooltip || !iconRef.current) return;
    iconRef.current.measureInWindow((x, y, w, _h) => {
      setTooltipPos({ x, y, w });
      setTooltipVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setTooltipVisible(false);
        setTooltipPos(null);
      }, TOOLTIP_SHOW_DURATION);
    });
  }, [tooltip]);

  const handleLongPress = useCallback(() => {
    if (onLongPress) {
      onLongPress();
      return;
    }
    showTooltip();
  }, [onLongPress, showTooltip]);

  const tooltipModal = tooltipVisible && tooltipPos ? (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        setTooltipVisible(false);
        setTooltipPos(null);
      }}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          setTooltipVisible(false);
          setTooltipPos(null);
        }}
      >
        <View
          onLayout={(e) => {
            const bubbleW = e.nativeEvent.layout.width;
            const screenW = Dimensions.get("window").width;
            const idealLeft = tooltipPos.x + tooltipPos.w / 2 - bubbleW / 2;
            const clampedLeft = Math.max(8, Math.min(idealLeft, screenW - bubbleW - 8));
            if (Math.abs(clampedLeft - idealLeft) > 1) {
              e.currentTarget?.setNativeProps?.({ style: { left: clampedLeft } });
            }
          }}
          style={{
            position: "absolute",
            top: tooltipPos.y - 40,
            left: Math.max(8, tooltipPos.x + tooltipPos.w / 2 - 50),
            alignItems: "center",
            zIndex: 9999,
          }}
          pointerEvents="none"
        >
          <View style={styles.tooltipBubble}>
            <BlurView
              intensity={Platform.OS === "ios" ? 60 : 40}
              tint="dark"
              style={StyleSheet.absoluteFill}
              {...(Platform.OS === "android"
                ? { experimentalBlurMethod: "dimezisBlurView" }
                : {})}
            />
            <View style={styles.tooltipGlassOverlay}>
              <Text style={styles.tooltipText}>{tooltip}</Text>
            </View>
          </View>
          <View style={styles.tooltipArrow} />
        </View>
      </Pressable>
    </Modal>
  ) : null;

  if (glass) {
    const containerSize = size + glassPadding * 2;
    if (isInteractive) {
      return (
        <>
          <Pressable
            ref={iconRef}
            onPress={onPress}
            onLongPress={(tooltip || onLongPress) ? handleLongPress : undefined}
            delayLongPress={LONG_PRESS_DELAY}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? tooltip}
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
          </Pressable>
          {tooltipModal}
        </>
      );
    }
    return (
      <View
        ref={iconRef}
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
      </View>
    );
  }

  if (isInteractive) {
    return (
      <>
        <Pressable
          ref={iconRef}
          onPress={onPress}
          onLongPress={(tooltip || onLongPress) ? handleLongPress : undefined}
          delayLongPress={LONG_PRESS_DELAY}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? tooltip}
        >
          {iconElement}
        </Pressable>
        {tooltipModal}
      </>
    );
  }

  return iconElement;
};

const styles = StyleSheet.create({
  glassContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipBubble: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  tooltipGlassOverlay: {
    backgroundColor: "rgba(30, 30, 30, 0.45)",
  },
  tooltipText: {
    color: "#F3F4F6",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "rgba(50, 50, 55, 0.7)",
  },
});

export default Icon;
