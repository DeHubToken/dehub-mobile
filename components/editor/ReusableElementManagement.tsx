import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import type { ReusableDesignElement } from "../../libs/editor/reusableElements";

export default function ReusableElementManagement({ element, onRename, onReplace, canReplace }: { element: ReusableDesignElement; onRename: (name: string) => void; onReplace: () => void; canReplace: boolean }) {
  const { t } = useTranslation(), [editing, setEditing] = useState(false), [name, setName] = useState(element.name), [error, setError] = useState("");
  useEffect(() => { setName(element.name); setEditing(false); setError(""); }, [element.id, element.name]);
  const rename = () => { try { onRename(name); setEditing(false); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not rename this element"); } };
  const button = (label: string, press: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View style={{ gap: 8 }}>{editing ? <><TextInput autoFocus value={name} maxLength={60} onChangeText={setName} returnKeyType="done" onSubmitEditing={() => { if (name.trim()) rename(); }} accessibilityLabel={t("editor.elements.name", { defaultValue: "Element name" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-xs text-white" /><View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(t("common.save", { defaultValue: "Save" }), rename, !name.trim())}{button(t("common.cancel", { defaultValue: "Cancel" }), () => { setEditing(false); setName(element.name); setError(""); })}</View></> : <View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(t("editor.elements.rename", { defaultValue: "Rename" }), () => { setName(element.name); setEditing(true); setError(""); })}{button(t("editor.elements.replaceSelection", { defaultValue: "Replace with selection" }), () => { try { onReplace(); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this element"); } }, !canReplace)}</View>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
