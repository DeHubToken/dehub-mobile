import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { getMedia } from "../../libs/editor/storage";
import { useBulkPagePreview, type BulkPagePreviewOptions } from "../../libs/editor/useBulkPagePreview";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function BulkPagePreview({ project, options }: { project: ProjectSnapshot; options: BulkPagePreviewOptions }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false);
  const result = useBulkPagePreview(project, options, getMedia, open);
  return <View className="rounded-lg border border-white/15 p-3" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-medium text-white/80">{t("editor.bulk.pagePreview", { defaultValue: "Preview populated page" })} {open ? "−" : "+"}</Text></Pressable>{open && <View accessibilityState={{ busy: result.busy }} style={{ gap: 8 }}>{!!result.image && <Image source={{ uri: result.image }} accessibilityLabel={t("editor.bulk.pagePreviewAlt", { defaultValue: "Template page populated with data record {{record}}", record: options.row + 1 })} resizeMode="contain" style={{ width: "100%", height: 220, opacity: result.busy ? 0.5 : 1 }} />}<Text accessibilityLiveRegion="polite" className="text-[10px] text-white/45">{result.busy ? t("editor.bulk.pagePreviewBusy", { defaultValue: "Updating populated page preview…" }) : t("editor.bulk.pagePreviewHint", { defaultValue: "Shows this record with the current text, QR and named-photo connections. The preview does not add pages to your design." })}</Text>{!!result.error && <Text accessibilityRole="alert" className="text-xs text-amber-200">{result.error}</Text>}</View>}</View>;
}
