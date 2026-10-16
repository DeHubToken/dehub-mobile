import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { getPages, pageAt } from "../../libs/editor/pages";
import { pageDetails, setPageDetails } from "../../libs/editor/pageDetails";
import type { ProjectSnapshot } from "../../libs/editor/types";

type Props = { project: ProjectSnapshot; time: number; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void };
function NotesDraft({ project, current, commit, index, start }: Props & { index: number; start: number }) {
  const { t } = useTranslation();
  const [original, setOriginal] = useState(() => pageDetails(project, index));
  const [title, setTitle] = useState(original.title), [notes, setNotes] = useState(original.notes);
  const [message, setMessage] = useState("");
  const save = () => {
    const latest = current(); if (!latest || latest.id !== project.id) return;
    const value = pageDetails(latest, index);
    if (getPages(latest.settings, latest.clips)[index]?.start !== start || value.title !== original.title || value.notes !== original.notes) {
      setMessage(t("editor.notes.changed", { defaultValue: "This page changed. Reopen Notes before saving." })); return;
    }
    const next = setPageDetails(latest, index, { title, notes });
    if (next !== latest) commit(next);
    setOriginal(pageDetails(next, index));
    setMessage(t("editor.notes.saved", { defaultValue: "Page notes saved" }));
  };
  return <View className="px-3" style={{ gap: 8 }}>
    <Text className="text-xs text-white/60">{t("editor.notes.name", { defaultValue: "Page name" })}</Text>
    <TextInput accessibilityLabel={t("editor.notes.name", { defaultValue: "Page name" })} value={title} onChangeText={value => { setTitle(value); setMessage(""); }} maxLength={200} placeholder={t("editor.pages.page", { number: index + 1 })} placeholderTextColor="#888" className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <Text className="text-xs text-white/60">{t("editor.notes.presenter", { defaultValue: "Presenter notes" })}</Text>
    <TextInput accessibilityLabel={t("editor.notes.presenter", { defaultValue: "Presenter notes" })} multiline value={notes} onChangeText={value => { setNotes(value); setMessage(""); }} maxLength={10000} textAlignVertical="top" className="min-h-[88px] rounded-lg border border-white/20 px-3 py-2 text-white" />
    <Pressable accessibilityRole="button" onPress={save} className="min-h-[40px] items-center justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t("editor.notes.save", { defaultValue: "Save page notes" })}</Text></Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{message}</Text>}
    <Text className="text-xs text-white/45">{t("editor.notes.hint", { defaultValue: "Names and notes are saved with this design. They do not appear in image, video, or PDF exports." })}</Text>
  </View>;
}
export default function PageNotesPanel(props: Props) {
  const page = pageAt(getPages(props.project.settings, props.project.clips), props.time);
  return <NotesDraft key={`${props.project.id}:${page.index}:${page.start}`} {...props} index={page.index} start={page.start} />;
}
