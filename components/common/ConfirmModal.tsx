import React from "react";
import { Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import GlassModal from "../ui/GlassModal";

export type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  confirmKind?: "primary" | "danger" | "neutral";
};

const kindBg: Record<NonNullable<ConfirmModalProps["confirmKind"]>, string> = {
  primary: "bg-theme-accent",
  danger: "bg-red-600",
  neutral: "bg-theme-neutrals-700",
};

// Near-white accent fill needs dark content; dark fills keep white content.
const kindContent: Record<NonNullable<ConfirmModalProps["confirmKind"]>, string> = {
  primary: "#09090B",
  danger: "#FFFFFF",
  neutral: "#FFFFFF",
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  loading,
  confirmKind = "primary",
}) => {
  return (
    <GlassModal visible={visible} onClose={onCancel} presentation="center" backdropScope="panel">
      <View className="px-5 py-5">
        <Text className="text-theme-neutrals-100 text-base font-semibold">{title}</Text>
        {!!description && (
          <Text className="text-theme-neutrals-300 text-sm mt-2">{description}</Text>
        )}
        <View className="flex-row justify-end mt-5">
          <TouchableOpacity
            className="px-4 py-2 rounded-xl bg-theme-neutrals-700/70 mr-2 active:opacity-80"
            onPress={onCancel}
            disabled={!!loading}
          >
            <Text className="text-theme-neutrals-100 text-sm">{cancelText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`${kindBg[confirmKind]} px-4 py-2 rounded-xl active:opacity-80`}
            onPress={onConfirm}
            disabled={!!loading}
          >
            {loading ? (
              <ActivityIndicator color={kindContent[confirmKind]} />
            ) : (
              <Text className="text-sm font-semibold" style={{ color: kindContent[confirmKind] }}>
                {confirmText}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ConfirmModal;
