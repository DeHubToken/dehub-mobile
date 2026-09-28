import React, { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";
import { useAppTheme } from "../../context/ThemeContext";

/** Lives beside the nav's scroll viewport, so scrolling never hides the room. */
export default function StageMiniPlayer() {
  const { currentSpace, isConnected, isModalOpen, openModal } = useStages();
  const { colors, isLight, isMinimal } = useAppTheme();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const visible = !!currentSpace && isConnected && !isModalOpen;

  useEffect(() => {
    pulse.value = 0;
    if (visible && !reducedMotion) pulse.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [visible, reducedMotion, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.65 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  if (!visible) return null;
  return (
    <Pressable
      onPress={() => openModal("live")}
      accessibilityRole="button"
      accessibilityLabel={`${t("nav.stages")}: ${currentSpace.title}`}
      testID="stage-nav-chip"
      style={[styles.chip, {
        backgroundColor: isMinimal ? "#000" : isLight ? colors.background : "#18181B",
        borderColor: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.10)",
      }]}
    >
      <Animated.View style={pulseStyle} pointerEvents="none">
        <Icon name="Headphones" size={20} color={colors.foreground} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
