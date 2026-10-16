import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMockupPreview, type MockupPreviewContent } from "../../libs/editor/useMockupPreview";
import { getMedia } from "../../libs/editor/storage";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";
import type { MockupTemplateId } from "../../libs/editor/mockupTemplates";
export default function MockupPreview({ project, source, preset, value, active }: { project: ProjectSnapshot; source: MediaClip | null; preset: MockupTemplateId; value: MockupPreviewContent | null; active: boolean }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), result = useMockupPreview(project.id, project.settings, source, preset, value, getMedia, open && active);
  return <View className="rounded-lg border border-white/10 p-2" style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="min-h-[40px] justify-center"><Text className="text-xs font-medium text-white/75">{t("editor.mockups.preview", { defaultValue: "Preview mockup" })} {open ? "−" : "+"}</Text></Pressable>{open && <View accessibilityState={{ busy: result.busy }} style={{ gap: 8 }}>{!!result.image && <Image source={{ uri: result.image }} resizeMode="contain" accessibilityLabel={t("editor.mockups.previewAlt", { defaultValue: "Draft mockup layout" })} style={{ width: "100%", height: 192, opacity: result.busy ? 0.5 : 1 }} />}<Text accessibilityLiveRegion="polite" className="text-[10px] text-white/45">{!value ? t("editor.mockups.previewNeedsData", { defaultValue: "Complete the frame colours to preview." }) : result.unavailable ? t("editor.mockups.previewUnavailable", { defaultValue: "The preview is unavailable. The frame settings remain editable." }) : result.busy ? t("editor.mockups.previewUpdating", { defaultValue: "Updating mockup preview…" }) : t("editor.mockups.previewHint", { defaultValue: "Preview shows the mockup without other artwork. Inserting it adds editable layers to the current page." })}</Text></View>}</View>;
}
