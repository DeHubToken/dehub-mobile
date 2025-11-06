import React from "react";
import { TouchableOpacity, Text, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type PrimaryButtonProps = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  style?: ViewStyle;
};

const PrimaryButton: React.FC<PrimaryButtonProps> = ({ title, onPress, disabled, className, style }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
      className={`overflow-hidden rounded-2xl ${disabled ? "opacity-60" : ""} ${className || ""}`}
      style={style}
    >
      <LinearGradient
        colors={["#60A5FA", "#34D399"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" }}
      >
        <Text className="text-theme-neutrals-900 text-sm font-semibold">{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
};

export default PrimaryButton;
