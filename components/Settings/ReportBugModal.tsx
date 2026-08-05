import React, { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Linking, Platform } from "react-native";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import GlassModal from "../ui/GlassModal";
import {
  toastError,
  toastInfo,
  toastSuccess,
  copyToClipboard,
} from "../../libs";
import { SUPPORT_MAIL, DEV_MAIL } from "../../config/links";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

type ReportBugModalProps = {
  visible: boolean;
  onClose: () => void;
  username?: string | null;
};

const ReportBugModal: React.FC<ReportBugModalProps> = ({
  visible,
  onClose,
  username,
}) => {
  const { t } = useTranslation();
  const displayName = useMemo(
    () => (username || "Anonymous").toString(),
    [username]
  );

  const toList = useMemo(() => {
    return [SUPPORT_MAIL].filter(Boolean).join(",");
  }, []);

  const subject = useMemo(() => {
    return `Dehub.io | Bug Report | ${displayName}`;
  }, [displayName]);

  const body = useMemo(() => {
    return [
      "Please describe the issue and steps to reproduce:",
      "",
      `User: ${displayName}`,
      `Device: ${Platform.OS} ${Platform.Version}`,
      `App Version: v${APP_VERSION}`,
    ].join("\n");
  }, [displayName]);

  const templatePreview = useMemo(() => {
    return `To: ${toList}\nSubject: ${subject}\n\n${body}`;
  }, [toList, subject, body]);

  const handleCopy = useCallback(async () => {
    try {
      copyToClipboard(templatePreview);
    } catch (e) {
      toastError(t("settings.copyDetailsFailed"));
    }
  }, [templatePreview, t]);

  const handleOpenMail = useCallback(async () => {
    try {
      const url = `mailto:${toList}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }

      // Fallback 1: Just email addresses
      try {
        await Linking.openURL(`mailto:${toList}`);
        return;
      } catch (e) {
        console.warn("[Settings] Minimal mailto failed", e);
      }

      // Fallback 2: copy to clipboard if mailto not supported
      copyToClipboard(templatePreview);
      toastInfo(t("settings.emailDetailsCopied"));
    } catch (e) {
      try {
        copyToClipboard(templatePreview);
        toastInfo(t("settings.emailDetailsCopied"));
      } catch (err) {
        toastError(t("settings.emailOpenFailed"));
      }
    }
  }, [toList, subject, body, templatePreview, t]);

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="center"
      maxHeight="70%"
      blurIntensity={30}
    >
      <View className="p-4">
        <Text className="text-white font-bold text-lg mb-2">{t("settings.reportBug")}</Text>
        <Text className="text-theme-neutrals-300 text-sm mb-3">
          {t("settings.reportBugThanks")}
        </Text>

        <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-lg p-3 mb-3">
          <Text className="text-theme-neutrals-400 text-[11px] mb-2">
            {t("settings.templatePreview")}
          </Text>
          <View className="bg-black/50 rounded-md p-3">
            <Text selectable className="text-theme-neutrals-200 text-xs">
              {templatePreview}
            </Text>
          </View>
        </View>

        <View className="flex-row justify-end">
          <TouchableOpacity
            onPress={onClose}
            className="h-11 px-4 rounded-xl items-center justify-center bg-theme-neutrals-700 mr-2"
          >
            <Text className="text-white">{t("common.close")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCopy}
            className="h-11 px-4 rounded-xl items-center justify-center bg-white/10 border border-white/20 mr-2"
          >
            <Text className="text-white font-semibold">{t("settings.copyDetails")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleOpenMail}
            className="h-11 px-4 rounded-xl items-center justify-center bg-theme-accent"
          >
            <Text className="text-theme-accent-foreground font-semibold">{t("settings.openEmail")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};

export default ReportBugModal;
