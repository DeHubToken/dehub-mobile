import React from "react";
import { View, TouchableOpacity, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type InfoTooltipProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  widthClassName?: string;
  placement?: "right" | "left";
  topClassName?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  iconColor?: string;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  style?: ViewStyle;
};

const InfoTooltip: React.FC<InfoTooltipProps> = ({
  open,
  onOpenChange,
  children,
  triggerClassName,
  panelClassName = "bg-zinc-900 border border-zinc-800 rounded-lg p-3",
  widthClassName = "w-64",
  placement = "right",
  topClassName = "top-10",
  iconName = "information-circle",
  iconSize = 18,
  iconColor = "#9CA3AF",
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  style,
}) => {
  return (
    <>
      <TouchableOpacity
        onPress={() => onOpenChange(!open)}
        hitSlop={hitSlop}
        className={triggerClassName}
        style={style}
      >
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      </TouchableOpacity>
      {open && (
        <View className="absolute inset-0 z-20" pointerEvents="box-none">
          <TouchableOpacity
            className="absolute inset-0"
            activeOpacity={1}
            onPress={() => onOpenChange(false)}
          />
          <View
            className={`absolute ${placement === "right" ? "right-2" : "left-2"} ${topClassName} ${widthClassName} ${panelClassName}`}
          >
            {children}
          </View>
        </View>
      )}
    </>
  );
};

export default InfoTooltip;
