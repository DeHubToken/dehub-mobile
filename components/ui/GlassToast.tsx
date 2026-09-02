import React from "react";
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

/**
 * The one toast body on mobile — every toast in the app is raised through
 * libs/toast, which renders this.
 *
 * It matches the web toaster (web's components/ui/toast-classes) rather than
 * being its own thing: a stacked glass card, bold heading, copy at 70% white
 * under it, a full-width pill for the action, and the close X in the top
 * corner. The two apps show the same toast for the same event, so a reader
 * moving between them should not have to learn it twice.
 *
 * There is no type icon, on either platform. The five types used to each get a
 * tinted disc — a tick, a cross, an exclamation mark — which said nothing the
 * copy did not already say and, once the card stacked, hung beside a paragraph
 * it had no baseline to sit against. `loading` is the exception, and the reason
 * the slot still exists at all: there the spinner is the only thing on screen
 * saying the work is still running.
 */
const GlassToast: React.FC<GlassToastProps> = ({
  type = "info",
  title,
  description,
  onClose,
  actionLabel,
  onActionPress,
}) => {
  if (!title) return null;

  return (
    <View
      className="w-[92%] self-center overflow-hidden rounded-2xl my-2"
      style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
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

      <View className="flex-row items-start p-4 gap-3 z-10">
        {type === "loading" && (
          <ActivityIndicator size="small" color="#FFFFFF" className="mt-0.5" />
        )}

        <View className="flex-1">
          <Text className="text-white text-base leading-5 font-bold">
            {title}
          </Text>

          {description && (
            <Text className="text-white/70 text-[13px] leading-5 mt-1.5">
              {description}
            </Text>
          )}

          {actionLabel && onActionPress && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onActionPress}
              // Web's pill, minus the gradient: expo-linear-gradient would mean
              // another view behind the label for a shift this size, and flat
              // white/10 on the blur reads the same at a glance.
              className="mt-3 h-9 w-full items-center justify-center rounded-xl bg-white/10"
              style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}
            >
              <Text className="text-sm font-medium text-white">
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
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default GlassToast;
