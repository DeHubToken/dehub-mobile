import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { useAppTheme } from '../../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../../theme/minimal';
import { GRAIN } from '../../theme/skins';
import { Image } from 'expo-image';

const SURFACE = "#18181B";
const SHEEN = "rgba(255,255,255,0.06)";

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  /** Retained for existing callers; panels use static theme materials. */
  intensity?: number;
  tint?: "light" | "dark" | "default";
  noBlur?: boolean;
}

/** Bounded panels use the active card material without sampling lists. */
const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  className = "",
  style,
}) => {
  const { skin, isMinimal } = useAppTheme();
  const material = skin ? {
    backgroundColor: skin.card.backgroundColor,
    borderWidth: skin.card.borderWidth,
    borderColor: skin.card.borderColor,
    borderTopColor: skin.card.borderTopColor,
  } : isMinimal ? { backgroundColor: '#000', borderWidth: 1, borderColor: MINIMAL_HAIRLINE } : undefined;
  return (
  <View className={`overflow-hidden ${className}`} style={[style, material]}>
    {!material ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: SURFACE }]} /> : null}
    {!material ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: SHEEN }]} /> : null}
    {skin?.grain ? <Image source={GRAIN} contentFit="cover" style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
    <View style={{ position: "relative" }}>{children}</View>
  </View>
  );
};

export default LiquidGlass;
