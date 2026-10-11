import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { captionTime, type CaptionTextPlan } from "../../libs/editor/captionText";
import { useCaptionTextEditor } from "../../libs/editor/useCaptionTextEditor";
import type { ProjectSnapshot, TextClip } from "../../libs/editor/types";

export default function CaptionTextEditorPanel({ project, disabled, onApply, onSeek }: {
  project: ProjectSnapshot; disabled: boolean; onApply: (plan: CaptionTextPlan) => boolean; onSeek: (clip: TextClip) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const editor = useCaptionTextEditor(project, disabled, onApply, onSeek);
  const button = "rounded-xl border border-white/10 px-4 py-3";
  return <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} className={button}>
      <Text className="text-white">{t("editor.captions.textPanel", { defaultValue: "Edit captions" })} · {editor.captions.length}</Text>
    </Pressable>
    {open && <View style={{ gap: 8 }}>
      <TextInput accessibilityLabel={t("editor.captions.findText", { defaultValue: "Find in captions" })} placeholder={t("editor.captions.findText", { defaultValue: "Find in captions" })} placeholderTextColor="#777" value={editor.query} maxLength={20000} editable={!editor.blocked} onChangeText={editor.setQuery} className="rounded-xl border border-white/10 bg-black p-3 text-white" />
      <TextInput accessibilityLabel={t("editor.captions.replaceText", { defaultValue: "Replace with" })} placeholder={t("editor.captions.replaceText", { defaultValue: "Replace with" })} placeholderTextColor="#777" value={editor.replacement} maxLength={20000} editable={!editor.blocked} onChangeText={editor.setReplacement} className="rounded-xl border border-white/10 bg-black p-3 text-white" />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: editor.matchCase }} disabled={editor.blocked} onPress={() => editor.setMatchCase(value => !value)} className={button}>
        <Text className="text-white">{editor.matchCase ? "✓ " : "○ "}{t("editor.captions.matchCase", { defaultValue: "Match case" })}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={editor.blocked || !editor.replaceCount} onPress={editor.replace} className={button} style={{ opacity: editor.blocked || !editor.replaceCount ? 0.4 : 1 }}>
        <Text className="text-white">{t("editor.captions.replaceCount", { defaultValue: "Replace in {{total}} captions", total: editor.replaceCount })}</Text>
      </Pressable>
      {editor.rows.map(clip => <Pressable key={clip.id} accessibilityRole="button" disabled={editor.blocked} onPress={() => editor.choose(clip)} className={button}>
        <Text className="text-theme-neutrals-400">{captionTime(clip.start)} – {captionTime(clip.start + clip.duration)}</Text>
        <Text className="text-white" numberOfLines={2}>{clip.text || t("editor.captions.emptyText", { defaultValue: "Empty caption" })}</Text>
      </Pressable>)}
      {!editor.filtered.length && <Text className="text-theme-neutrals-400">{t("editor.captions.noTextMatches", { defaultValue: "No editable captions match. Import captions or change your search." })}</Text>}
      {editor.pages > 1 && <View className="flex-row items-center justify-between">
        <Pressable accessibilityRole="button" disabled={editor.blocked || !editor.page} onPress={() => editor.setPage(editor.page - 1)} className="px-3 py-3"><Text className="text-white">{t("editor.captions.previousText", { defaultValue: "Previous" })}</Text></Pressable>
        <Text className="text-white">{editor.page + 1} / {editor.pages}</Text>
        <Pressable accessibilityRole="button" disabled={editor.blocked || editor.page + 1 >= editor.pages} onPress={() => editor.setPage(editor.page + 1)} className="px-3 py-3"><Text className="text-white">{t("editor.captions.nextText", { defaultValue: "Next" })}</Text></Pressable>
      </View>}
      {editor.draft && <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}>
        <TextInput accessibilityLabel={t("editor.captions.captionText", { defaultValue: "Caption text" })} value={editor.draft.text} maxLength={20000} multiline editable={!editor.blocked} onChangeText={editor.edit} className="rounded-xl border border-white/10 bg-black p-3 text-white" style={{ minHeight: 90, textAlignVertical: "top" }} />
        {editor.stale && <Text accessibilityLiveRegion="polite" className="text-theme-neutrals-400">{t("editor.captions.textChanged", { defaultValue: "Captions changed. Reload the line before saving." })}</Text>}
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" disabled={!editor.canSave} onPress={editor.save} className={button} style={{ opacity: editor.canSave ? 1 : 0.4 }}><Text className="text-white">{t("editor.captions.saveText", { defaultValue: "Save caption" })}</Text></Pressable>
          {editor.stale && <Pressable accessibilityRole="button" disabled={editor.blocked} onPress={editor.reload} className={button}><Text className="text-white">{t("editor.captions.reloadText", { defaultValue: "Reload caption" })}</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={editor.blocked} onPress={editor.close} className={button}><Text className="text-white">{t("common.cancel")}</Text></Pressable>
        </View>
      </View>}
      {editor.status && <Text accessibilityLiveRegion="polite" className="text-theme-neutrals-400">{t(`editor.captions.${editor.status}`, { defaultValue: editor.status === "textSaved" ? "Caption changes saved." : "Captions changed. Reload the line before saving." })}</Text>}
    </View>}
  </View>;
}
