import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import GlassIndicator from "../ui/GlassIndicator";
import GlassModal from "../ui/GlassModal";

export type UploadStage =
  | "idle"
  | "uploading"
  | "processing"
  | "awaiting-wallet"
  | "minting"
  | "finalizing"
  | "done";

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmText: string;
  stage: UploadStage;
  variant?: "bounty" | "default"; // controls primary button label when idle
  title?: string;
};

const stageLabel = (stage: UploadStage) => {
  switch (stage) {
    case "uploading":
      return "Uploading…";
    case "processing":
      return "Uploading…";
    case "awaiting-wallet":
      return "Confirming…";
    case "minting":
      return "Minting…";
    case "finalizing":
      return "Finalizing…";
    default:
      return "Processing…";
  }
};

const ConfirmUploadModal: React.FC<Props> = ({
  visible,
  onClose,
  onConfirm,
  confirmText,
  stage,
  variant = "default",
  title = "Are you absolutely sure?",
}) => {
  const busy = stage !== "idle" && stage !== "done";
  const primaryIdleLabel = variant === "bounty" ? "Proceed" : "Continue";
  return (
    <GlassModal
      visible={visible}
      onClose={() => {
        if (!busy) onClose();
      }}
      presentation="center"
      maxHeight="60%"
      blurIntensity={30}
    >
      <View className="p-4">
        <Text className="text-white font-bold text-lg mb-2">{title}</Text>
        <Text className="text-theme-neutrals-300 text-sm">{confirmText}</Text>
        <View className="flex-row justify-end mt-4">
          <TouchableOpacity
            disabled={busy}
            onPress={onClose}
            className={`px-4 py-3 rounded-full bg-theme-neutrals-800 border border-theme-neutrals-700 mr-2 ${
              busy ? "opacity-50" : ""
            }`}
          >
            <Text className="text-white">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
              disabled={busy}
              onPress={onConfirm}
              className={`px-4 py-3 rounded-full overflow-hidden ${
                busy ? "opacity-50" : ""
              }`}
            >
              <GlassIndicator borderRadius={24} />
              {busy ? (
                <View className="flex-row items-center">
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text className="text-white font-semibold ml-2">
                    {stageLabel(stage)}
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-semibold">
                  {primaryIdleLabel}
                </Text>
              )}
            </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ConfirmUploadModal;
