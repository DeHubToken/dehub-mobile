import React from "react";
import { TouchableOpacity, Text, ViewStyle, StyleSheet } from "react-native";
import AccentButtonGradient from "./AccentButtonGradient";
import { useAppTheme } from "../../context/ThemeContext";

type PrimaryButtonProps = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  style?: ViewStyle;
};

/** Shared primary action using the active theme's existing chrome. */
const PrimaryButton: React.FC<PrimaryButtonProps> = ({ title, onPress, disabled, className, style }) => {
  const { skin } = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      className={`overflow-hidden rounded-xl ${disabled ? "opacity-60" : ""} ${className || ""}`}
      style={style}
    >
      <AccentButtonGradient style={styles.fill}>
        <Text style={[styles.label, skin && { color: skin.centreIcon }]}>{title}</Text>
      </AccentButtonGradient>
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
