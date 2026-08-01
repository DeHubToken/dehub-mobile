/**
 * ReportPostModal - Glass modal for reporting content
 *
 * Provides common report reasons as selectable options,
 * plus an optional details text field.
 */
import React, { memo, useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import { reportContent } from "../../services/nft.service";
import { toastSuccess, toastError } from "../../libs";

const REPORT_REASONS = [
  { id: "spam", label: "Spam or misleading", icon: "alert-circle-outline" as const },
  { id: "harassment", label: "Harassment or bullying", icon: "hand-left-outline" as const },
  { id: "hate", label: "Hate speech or symbols", icon: "ban-outline" as const },
  { id: "violence", label: "Violence or dangerous acts", icon: "warning-outline" as const },
  { id: "nudity", label: "Nudity or sexual content", icon: "eye-off-outline" as const },
  { id: "copyright", label: "Copyright infringement", icon: "document-text-outline" as const },
  { id: "misinformation", label: "Misinformation", icon: "megaphone-outline" as const },
  { id: "other", label: "Other", icon: "ellipsis-horizontal-outline" as const },
] as const;

interface ReportPostModalProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string | undefined;
}

const ReportPostModalComponent: React.FC<ReportPostModalProps> = ({
  visible,
  onClose,
  tokenId,
}) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const resetState = useCallback(() => {
    setSelectedReason(null);
    setDetails("");
    setSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Reset after modal animation
    setTimeout(resetState, 300);
  }, [onClose, resetState]);

  const handleSubmit = useCallback(async () => {
    if (!selectedReason || tokenId == null) return;
    setSubmitting(true);
    try {
      await reportContent({
        tokenId,
        reason: selectedReason,
        additionalInfo: details.trim() || undefined,
      });
      setSubmitted(true);
    } catch (e: any) {
      console.error("[ReportPostModal] report error", e);
      toastError(e?.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }, [tokenId, selectedReason, details]);

  if (submitted) {
    return (
      <GlassModal
        visible={visible}
        onClose={handleClose}
        presentation="center"
        maxHeight="50%"
        blurIntensity={40}
      >
        <View className="p-6 items-center">
          <View className="w-16 h-16 rounded-full bg-green-500/15 items-center justify-center mb-4">
            <Ionicons name="checkmark-circle" size={36} color="#22C55E" />
          </View>
          <Text className="text-white text-lg font-bold text-center mb-2">
            Report Submitted
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center leading-5 mb-5">
            Thank you for helping keep the community safe. We'll review this
            content and take appropriate action.
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            className="bg-white/10 border border-white/15 px-8 py-3 rounded-xl"
            activeOpacity={0.8}
          >
            <Text className="text-white text-sm font-semibold">Done</Text>
          </TouchableOpacity>
        </View>
      </GlassModal>
    );
  }

  return (
    <GlassModal
      visible={visible}
      onClose={() => {
        if (!submitting) handleClose();
      }}
      presentation="bottom"
      maxHeight="80%"
      blurIntensity={50}
      dismissible={!submitting}
    >
      {/* Handle */}
      <View className="items-center pt-3 pb-1">
        <View className="w-10 h-1 rounded-full bg-white/20" />
      </View>

      <View className="px-5 pb-6">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4 pt-2">
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-xl bg-yellow-500/15 items-center justify-center mr-2">
              <Ionicons name="flag-outline" size={18} color="#D4D4D8" />
            </View>
            <View>
              <Text className="text-white text-lg font-bold">Report Content</Text>
              <Text className="text-theme-neutrals-500 text-xs">
                Why are you reporting this?
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            disabled={submitting}
            className="p-2 bg-white/5 rounded-full"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Reason options */}
        <View className="mb-4">
          {REPORT_REASONS.map((reason) => {
            const isSelected = selectedReason === reason.id;
            return (
              <TouchableOpacity
                key={reason.id}
                onPress={() => setSelectedReason(reason.id)}
                activeOpacity={0.7}
                className={`flex-row items-center px-4 py-3 rounded-xl mb-1.5 border ${
                  isSelected
                    ? "bg-yellow-500/10 border-yellow-500/30"
                    : "bg-white/3 border-transparent"
                }`}
              >
                <Ionicons
                  name={reason.icon}
                  size={18}
                  color={isSelected ? "#D4D4D8" : "#9CA3AF"}
                />
                <Text
                  className={`ml-3 text-sm font-medium ${
                    isSelected ? "text-yellow-400" : "text-theme-neutrals-200"
                  }`}
                >
                  {reason.label}
                </Text>
                {isSelected && (
                  <View className="ml-auto">
                    <Ionicons name="checkmark-circle" size={18} color="#D4D4D8" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Additional details */}
        {selectedReason && (
          <View className="mb-4">
            <Text className="text-theme-neutrals-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Additional Details (optional)
            </Text>
            <TextInput
              value={details}
              onChangeText={setDetails}
              maxLength={500}
              placeholder="Provide more context…"
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm min-h-[60px]"
            />
          </View>
        )}

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!selectedReason || submitting}
          className={`py-3.5 rounded-xl items-center ${
            selectedReason ? "bg-yellow-600" : "bg-yellow-600/30"
          }`}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-sm font-semibold">
              Submit Report
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </GlassModal>
  );
};

const ReportPostModal = memo(ReportPostModalComponent);
export default ReportPostModal;
