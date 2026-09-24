import React from "react";
import { useTranslation } from "react-i18next";
import { View, TouchableOpacity, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import GlassModal from "./GlassModal";

type InfoTooltipProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  triggerClassName?: string;
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
  iconName = "information-circle",
  iconSize = 18,
  iconColor = colors.neutrals[400],
  hitSlop = { top: 8, bottom: 8, left: 8, right: 8 },
  style,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <TouchableOpacity
        onPress={() => onOpenChange(!open)}
        hitSlop={hitSlop}
        className={triggerClassName}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={t("common.moreInfo")}
      >
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      </TouchableOpacity>
      {/* A small modal rather than an absolutely positioned panel: the panel
          was clipped by its card, and Android back did not close it. The
          modal closes on back and on a tap outside. */}
      <GlassModal visible={open} onClose={() => onOpenChange(false)}>
        <View style={{ padding: 16 }}>{children}</View>
      </GlassModal>
    </>
  );
};

export default InfoTooltip;
