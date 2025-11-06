import React, { memo, useMemo } from "react";
import { TouchableOpacity, Text } from "react-native";

export type TabButtonProps = {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

const TabButton: React.FC<TabButtonProps> = ({ label, active, disabled, onPress, testID }) => {
  const containerClasses = useMemo(
    () => `px-4 py-1.5 rounded-full ${active ? "bg-white/10" : ""} ${disabled ? "opacity-40" : ""}`,
    [active, disabled]
  );
  const textClasses = useMemo(
    () => (active ? "text-white" : "text-theme-neutrals-400"),
    [active]
  );

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !!disabled }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      className={containerClasses}
      testID={testID}
    >
      <Text className={textClasses}>{label}</Text>
    </TouchableOpacity>
  );
};

export default memo(TabButton);
