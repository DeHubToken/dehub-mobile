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

  const accent = useMemo((): { bg: string; icon: string } => {
    switch (type) {
      case "success":
        return { bg: "#22C55E", icon: "checkmark-circle" };
      case "error":
        return { bg: "#EF4444", icon: "close-circle" };
      case "warning":
        return { bg: "#D4D4D8", icon: "warning" };
      case "loading":
        return { bg: "#D4D4D8", icon: "time-outline" };
      default:
        return { bg: "#6B7280", icon: "information-circle" };
    }
  }, [type]);

  return (
    <View
      className="w-[92%] self-center overflow-hidden rounded-xl my-2"
      style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
    >
      {/* Android's experimental blur (dimezisBlurView) crashes with
          IndexOutOfBoundsException when list views mutate during its pre-draw
          snapshot — toasts show over live feeds, so real blur is iOS-only and
          Android gets a translucent glass fallback. */}
      {Platform.OS === "ios" ? (
        <BlurView intensity={20} tint="dark" className="absolute inset-0" />
      ) : (
        <View
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(16, 16, 20, 0.65)" }}
        />
      )}
      <View className="absolute inset-0 bg-black/25" />

      <View className={`flex-row ${description ? "items-start" : "items-center"} p-4 gap-3 z-10`}>
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
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={onClose}
          >
              <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default GlassToast;
