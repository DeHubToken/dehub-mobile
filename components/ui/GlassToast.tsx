import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

type GlassToastType = "success" | "error" | "info" | "warning" | "loading";

export interface GlassToastProps {
  type?: GlassToastType;
  title: string;
  description?: string;
  onClose?: () => void;
  actionLabel?: string;
  onActionPress?: () => void;
}

const GlassToast: React.FC<GlassToastProps> = ({
  type = "info",
  title,
  description,
  onClose,
  actionLabel,
  onActionPress,
}) => {
  if (!title) return null;

  const accent = useMemo((): { bg: string; fg: string; icon: string } => {
    switch (type) {
      case "success":
        return { bg: "#10B981", fg: "#052e1f", icon: "checkmark-circle" };
      case "error":
        return { bg: "#EF4444", fg: "#3b0a0a", icon: "close-circle" };
      case "warning":
        return { bg: "#F59E0B", fg: "#3a2403", icon: "warning" };
      case "loading":
        return { bg: "#60A5FA", fg: "#0b2345", icon: "time-outline" };
      default:
        return { bg: "#6B7280", fg: "#101214", icon: "information-circle" };
    }
  }, [type]);

  return (
    <View
      className="w-[92%] self-center overflow-hidden rounded-2xl my-2"
      style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
    >
      {/* Glass background */}
      <BlurView
        intensity={20}
        tint="dark"
        className="absolute inset-0"
        {...(Platform.OS === "android"
          ? { experimentalBlurMethod: "dimezisBlurView" as const }
          : {})}
      />
      <View className="absolute inset-0 bg-black/25" />

      <View className="flex-row items-start p-4 gap-3 z-10">
        <View
          className="h-7 w-7 rounded-full items-center justify-center"
          style={{ backgroundColor: accent.bg + "33" }}
        >
          {type === "loading" ? (
            <ActivityIndicator size="small" color={accent.bg} />
          ) : (
            <Ionicons name={accent.icon as any} size={18} color={accent.bg} />
          )}
        </View>

        <View className="flex-1">
          <Text className="text-white text-[15px] leading-5 font-semibold">
            {title}
          </Text>

          {description && (
            <Text className="text-white/80 text-[13px] leading-5 mt-1">
              {description}
            </Text>
          )}

          {actionLabel && onActionPress && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onActionPress}
              className="mt-2 self-start px-3 py-1.5 rounded-full"
              style={{ backgroundColor: accent.bg + "33" }}
            >
              <Text className="text-[13px] font-medium" style={{ color: accent.bg }}>
                {actionLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {onClose && (
          <TouchableOpacity
            accessibilityLabel="Close"
            // hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onClose}
            // className="mt-0.5"
          >
              <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default GlassToast;
