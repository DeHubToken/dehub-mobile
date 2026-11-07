/**
 * "Aa" in a chat header: pick how big chat text is. Same pref as Settings →
 * Appearance → Chat text size (hooks/useAppPrefs `chatTextSize`).
 */
import React, { useState } from "react";
import { Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { SettingsOptionModal } from "../Settings/SettingsPrimitives";
import { setAppPref, useAppPrefs } from "../../hooks/useAppPrefs";
import { CHAT_TEXT_SIZES, isChatTextSize, type ChatTextSize } from "../../libs/chatTextSize";

export function useChatTextSizeLabels(): Record<ChatTextSize, string> {
  const { t } = useTranslation();
  return {
    small: t("chatTextSize.small", "Small"),
    default: t("chatTextSize.default", "Default"),
    large: t("chatTextSize.large", "Large"),
    larger: t("chatTextSize.larger", "Larger"),
    largest: t("chatTextSize.largest", "Largest"),
  };
}

export function ChatTextSizePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const prefs = useAppPrefs();
  const labels = useChatTextSizeLabels();
  return (
    <SettingsOptionModal
      visible={visible}
      onClose={onClose}
      title={t("settings.chatTextSize", "Chat text size")}
      value={prefs.chatTextSize}
      options={CHAT_TEXT_SIZES.map((size) => ({ value: size, label: labels[size] }))}
      onSelect={(value) => { if (isChatTextSize(value)) setAppPref("chatTextSize", value); }}
      maxHeight="70%"
    />
  );
}

export default function ChatTextSizeButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("chatTextSize.title", "Text size")}
        hitSlop={6}
        style={{ height: 36, minWidth: 32, alignItems: "center", justifyContent: "center", flexDirection: "row" }}
      >
        <Text allowFontScaling={false} style={{ color: "#A1A1AA", fontSize: 13, fontWeight: "700" }}>A</Text>
        <Text allowFontScaling={false} style={{ color: "#A1A1AA", fontSize: 18, fontWeight: "700" }}>a</Text>
      </TouchableOpacity>
      <ChatTextSizePicker visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
