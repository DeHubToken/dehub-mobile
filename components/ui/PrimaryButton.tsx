import React from "react";
import { TouchableOpacity, Text, ViewStyle, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type PrimaryButtonProps = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  style?: ViewStyle;
};

/**
 * Mirrors the web app's primary button (dehubweb/src/components/ui/button.tsx,
 * `default` variant at `default` size): 40pt tall, 16pt horizontal padding,
 * 12pt radius, 14pt medium white label, white-glass gradient
 * (white/20 -> white/10 -> white/5) inside a white/30 hairline.
 *
 * Was a blue->green gradient (#D4D4D8 -> #F4F4F5) with a near-black label at
 * 44/20/16 - a coloured fill the web design system forbids
 * (dehubweb/src/index.css:14-15,22 mandates black/white/zinc, no coloured
 * accents), which made every CTA in the app read off-brand.
 */
const PrimaryButton: React.FC<PrimaryButtonProps> = ({ title, onPress, disabled, className, style }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      className={`overflow-hidden rounded-xl ${disabled ? "opacity-60" : ""} ${className || ""}`}
      style={style}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
      >
        <Text style={styles.label}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fill: {
    height: 40,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
});

export default PrimaryButton;
