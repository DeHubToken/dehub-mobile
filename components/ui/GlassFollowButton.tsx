import React, { FC } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TouchableOpacity, ActivityIndicator, ViewStyle, StyleSheet } from "react-native";
import Icon from "./Icon";
import { colors } from "../../theme/colors";

interface GlassFollowButtonProps {
  isFollowing: boolean;
  isPending: boolean;
  isLoading: boolean;
  followsYou?: boolean;
  onPress: () => void;
  className?: string;
  style?: ViewStyle;
}

const BUTTON_H = 32;
const RADIUS = 8;

const GlassFollowButton: FC<GlassFollowButtonProps> = ({
  isFollowing,
  isPending,
  isLoading,
  followsYou,
  onPress,
  className = "",
  style,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <View className={`h-8 items-center justify-center ${className}`} style={style}>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }

  let label = followsYou ? t("follow.followBack") : t("follow.follow");
  let labelColor = "#fff";
  let iconNode: React.ReactNode = null;

  if (isPending) {
    label = t("follow.requested");
    labelColor = colors.neutrals[400];
    iconNode = <Icon name="Clock" size={12} color={colors.neutrals[400]} />;
  } else if (isFollowing) {
    label = t("follow.following");
    labelColor = colors.neutrals[300];
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className={className}
      style={[btnStyles.wrapper, style]}
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <View style={btnStyles.content}>
        {iconNode}
        <Text style={[btnStyles.label, { color: labelColor }, iconNode ? { marginLeft: 4 } : undefined]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const btnStyles = StyleSheet.create({
  wrapper: {
    height: BUTTON_H,
    borderRadius: RADIUS,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
  },
});

export default React.memo(GlassFollowButton);
