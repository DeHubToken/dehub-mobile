import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import GlassModal from "../ui/GlassModal";

/** The server's limit (dehub-stream-backend src/nft/media-descriptions), and Mastodon's. */
export const ALT_TEXT_MAX = 1500;

/**
 * The ALT pill on a composer preview. Outlined until the media has a
 * description, filled once it does, so a creator can see which pictures still
 * need one.
 */
export function AltTextPill({ hasText, onPress, className }: { hasText: boolean; onPress: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={hasText ? t("altText.edit") : t("altText.add")}
      className={`rounded-lg px-2 py-1 ${hasText ? "bg-white" : "dark-surface bg-black/70 border border-white/30"} ${className ?? ""}`}
    >
      <Text style={{ color: hasText ? "#000" : "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>
        {t("altText.badge")}
      </Text>
    </TouchableOpacity>
  );
}

interface AltTextSheetProps {
  visible: boolean;
  onClose: () => void;
  kind: "image" | "video";
  previewUri?: string;
  initial?: string;
  onSave: (text: string) => void;
}

/** Writing one description. Saving an empty box clears it. */
export default function AltTextSheet({ visible, onClose, kind, previewUri, initial, onSave }: AltTextSheetProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initial ?? "");
  useEffect(() => { if (visible) setDraft(initial ?? ""); }, [visible, initial]);

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="bottom">
      <View className="px-5 pt-4 pb-6">
        <Text className="text-white text-[17px] font-bold">
          {kind === "video" ? t("altText.titleVideo") : t("altText.titleImage")}
        </Text>
        <Text className="text-theme-neutrals-400 text-xs mt-1">{t("altText.help")}</Text>
        {kind === "image" && previewUri ? (
          <Image source={{ uri: previewUri }} style={{ width: "100%", height: 140, borderRadius: 12, marginTop: 12 }} resizeMode="contain" />
        ) : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          maxLength={ALT_TEXT_MAX}
          multiline
          autoFocus
          placeholder={t("altText.placeholder")}
          placeholderTextColor="rgba(255,255,255,0.4)"
          className="mt-3 rounded-xl border border-white/15 bg-white/5 p-3 text-white text-sm"
          style={{ minHeight: 110, textAlignVertical: "top" }}
        />
        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-theme-neutrals-500 text-xs">{draft.length} / {ALT_TEXT_MAX}</Text>
          <View className="flex-row">
            <TouchableOpacity onPress={onClose} className="rounded-xl px-4 py-2.5 mr-2" accessibilityRole="button">
              <Text className="text-white/80 text-sm">{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onSave(draft.slice(0, ALT_TEXT_MAX).trim()); onClose(); }}
              className="rounded-xl bg-white px-4 py-2.5"
              accessibilityRole="button"
            >
              <Text className="text-black text-sm font-semibold">{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </GlassModal>
  );
}
