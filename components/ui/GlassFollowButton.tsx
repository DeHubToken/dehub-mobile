import React, { FC } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ViewStyle, StyleSheet } from "react-native";
import Icon from "./Icon";

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
  if (isLoading) {
    return (
      <View className={`h-8 items-center justify-center ${className}`} style={style}>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    );
  }

  let label = followsYou ? "Follow Back" : "Follow";
  let labelColor = "#fff";
  let iconNode: React.ReactNode = null;

  if (isPending) {
    label = "Requested";
    labelColor = "#9CA3AF";
    iconNode = <Icon name="Clock" size={12} color="#9CA3AF" />;
  } else if (isFollowing) {
    label = "Following";
    labelColor = "#D1D5DB";
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className={className}
      style={[btnStyles.wrapper, style]}
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
