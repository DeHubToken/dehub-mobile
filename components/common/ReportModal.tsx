/**
 * ReportModal - Glass modal for reporting content or users
 *
 * Unified report flow with type-specific reason codes.
 * Supports "content" (video/post) and "user" report types.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { reportContent, reportUser } from "../../services/nft.service";
import { toastError } from "../../libs";
import { useKeyboard } from "../../hooks/useKeyboard";

// =============================================================================
// Reason definitions
// =============================================================================

interface ReportReason {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const CONTENT_REASONS: ReportReason[] = [
  { id: "sexual_content", label: "Sexual content", icon: "eye-off-outline" },
  { id: "violent_content", label: "Violent or graphic content", icon: "warning-outline" },
  { id: "hateful_content", label: "Hateful content", icon: "ban-outline" },
  { id: "harassment_bullying", label: "Harassment or bullying", icon: "hand-left-outline" },
  { id: "harmful_dangerous", label: "Harmful or dangerous acts", icon: "flame-outline" },
  { id: "misinformation", label: "Misinformation", icon: "megaphone-outline" },
  { id: "child_abuse", label: "Child abuse", icon: "shield-outline" },
  { id: "spam_misleading", label: "Spam or misleading", icon: "alert-circle-outline" },
  { id: "scam_fraud", label: "Scam or fraud", icon: "card-outline" },
  { id: "infringes_rights", label: "Infringes my rights", icon: "document-text-outline" },
  { id: "other", label: "Other", icon: "ellipsis-horizontal-outline" },
];

const USER_REASONS: ReportReason[] = [
  { id: "impersonation", label: "Impersonation", icon: "person-outline" },
  { id: "harassment_bullying", label: "Harassment or bullying", icon: "hand-left-outline" },
  { id: "hateful_behavior", label: "Hateful behavior", icon: "ban-outline" },
  { id: "spam", label: "Spam", icon: "alert-circle-outline" },
  { id: "scam_fraud", label: "Scam or fraud", icon: "card-outline" },
  { id: "underage", label: "Underage user", icon: "shield-outline" },
  { id: "inappropriate_profile", label: "Inappropriate profile", icon: "eye-off-outline" },
  { id: "other", label: "Other", icon: "ellipsis-horizontal-outline" },
];

// =============================================================================
// Types
// =============================================================================

export type ReportType = "content" | "user";

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  type: ReportType;
  /** Token ID — required when type === "content" */
  tokenId?: number | string;
  /** User identifier (address/username) — required when type === "user" */
  userId?: string;
  /** Display name for the user being reported */
  userName?: string;
}

// =============================================================================
// Component
// =============================================================================

const ReportModalComponent: React.FC<ReportModalProps> = ({
  visible,
  onClose,
  type,
  tokenId,
  userId,
  userName,
}) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  const reasons = useMemo(
    () => (type === "content" ? CONTENT_REASONS : USER_REASONS),
    [type]
  );

  const accentColor = type === "content" ? "#FBBF24" : "#F97316";

  const headerConfig = useMemo(
    () =>
      type === "content"
        ? {
            title: "Report Video",
            subtitle: "Why are you reporting this video?",
            icon: "flag-outline" as keyof typeof Ionicons.glyphMap,
            iconColor: "#FBBF24",
            iconBg: "bg-yellow-500/15",
            successMessage:
              "Thank you for helping keep the community safe. We'll review this content and take appropriate action.",
          }
        : {
            title: "Report User",
            subtitle: userName
              ? `Why are you reporting ${userName}?`
              : "Why are you reporting this user?",
            icon: "person-remove-outline" as keyof typeof Ionicons.glyphMap,
            iconColor: "#F97316",
            iconBg: "bg-orange-500/15",
            successMessage:
              "Thank you for your report. We'll review this account and take appropriate action.",
          },
    [type, userName]
  );

  const resetState = useCallback(() => {
    setSelectedReason(null);
    setAdditionalInfo("");
    setSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(resetState, 300);
  }, [onClose, resetState]);

  const handleSubmit = useCallback(async () => {
    if (!selectedReason) return;

    setSubmitting(true);
    try {
      if (type === "content") {
        if (tokenId == null) throw new Error("Missing tokenId");
        await reportContent({
          tokenId,
          reason: selectedReason,
          additionalInfo: additionalInfo.trim() || undefined,
        });
      } else {
        if (!userId) throw new Error("Missing userId");
        await reportUser({
          userId,
          reason: selectedReason,
          additionalInfo: additionalInfo.trim() || undefined,
        });
      }
      setSubmitted(true);
    } catch (e: any) {
      console.error(`[ReportModal] ${type} report error`, e);
      const msg = e?.message || "Failed to submit report";
      // Handle duplicate report gracefully
      if (msg.toLowerCase().includes("already reported")) {
        toastError("You've already reported this. We're reviewing it.");
      } else {
        toastError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }, [type, tokenId, userId, selectedReason, additionalInfo]);

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------
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
            {headerConfig.successMessage}
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

  // ---------------------------------------------------------------------------
  // Report form
  // ---------------------------------------------------------------------------
  return (
    <GlassModal
      visible={visible}
      onClose={() => {
        if (!submitting) handleClose();
      }}
      presentation="bottom"
      maxHeight="85%"
      blurIntensity={50}
      dismissible={!submitting}
    >
      {/* Handle */}
      <View className="items-center pt-3 pb-1">
        <View className="w-10 h-1 rounded-full bg-white/20" />
      </View>

      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: kbVisible ? kbHeight + 16 : 32 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4 pt-2">
          <View className="flex-row items-center flex-1 mr-3">
            <View
              className={`w-9 h-9 rounded-xl ${headerConfig.iconBg} items-center justify-center mr-2`}
            >
              <Ionicons
                name={headerConfig.icon}
                size={18}
                color={headerConfig.iconColor}
              />
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold">
                {headerConfig.title}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>
                {headerConfig.subtitle}
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
          {reasons.map((reason) => {
            const isSelected = selectedReason === reason.id;
            return (
              <TouchableOpacity
                key={reason.id}
                onPress={() => setSelectedReason(reason.id)}
                activeOpacity={0.7}
                className={`flex-row items-center px-4 py-3 rounded-xl mb-1.5 border ${
                  isSelected
                    ? "bg-white/10 border-white/20"
                    : "bg-white/3 border-transparent"
                }`}
              >
                <Ionicons
                  name={reason.icon}
                  size={18}
                  color={isSelected ? accentColor : "#9CA3AF"}
                />
                <Text
                  className={`ml-3 text-sm font-medium flex-1 ${
                    isSelected
                      ? "text-white"
                      : "text-theme-neutrals-200"
                  }`}
                >
                  {reason.label}
                </Text>
                {isSelected && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={accentColor}
                  />
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
              value={additionalInfo}
              onChangeText={setAdditionalInfo}
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
        <AccentButtonGradient borderRadius={12}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!selectedReason || submitting}
            className="py-3.5 items-center"
            style={{ opacity: selectedReason ? 1 : 0.4 }}
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
        </AccentButtonGradient>
      </ScrollView>
    </GlassModal>
  );
};

const ReportModal = memo(ReportModalComponent);
export default ReportModal;
