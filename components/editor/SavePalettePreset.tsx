import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useBrandPresets } from "../../libs/editor/useBrandPresets";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";

export default function SavePalettePreset({ colours }: { colours: readonly string[] }) {
  const { t } = useTranslation(), library = useBrandPresets(), [name, setName] = useState(""), [message, setMessage] = useState(""), [error, setError] = useState(""), [scope, setScope] = useState(library.scope);
  if (scope !== library.scope) { setScope(library.scope); setName(""); setMessage(""); setError(""); }
  const disabled = !colours.length || !name.trim() || library.presets.length >= 20;
  const save = () => { try { const result = library.create(name, { colors: [...colours], headingFont: null, bodyFont: null }); setName(""); setError(""); setMessage(t(result.persisted ? "editor.palette.savedPreset" : "editor.brand.presetSessionOnly", { defaultValue: result.persisted ? "Palette saved in brand styles on this device" : "Storage is unavailable. These styles are saved for this visit." })); } catch (reason) { setMessage(""); setError(reason instanceof Error ? reason.message : "Could not save this palette"); } };
  return <View style={{ gap: 8 }}><View className="flex-row" style={{ gap: 8 }}><TextInput value={name} onChangeText={setName} maxLength={60} accessibilityLabel={t("editor.palette.presetName", { defaultValue: "Palette name" })} placeholder={t("editor.palette.presetName", { defaultValue: "Palette name" })} placeholderTextColor="#888" returnKeyType="done" onSubmitEditing={() => { if (!disabled) save(); }} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-xs text-white" /><Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={save} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{t("editor.palette.savePreset", { defaultValue: "Save palette" })}</Text></Pressable></View>{library.presets.length >= 20 && <Text className="text-xs text-white/45">{t("editor.palette.presetLimit", { defaultValue: "Your 20 brand-style slots are full. Remove a saved style before adding a palette." })}</Text>}{!!message && <Text accessibilityLiveRegion="polite" className="text-xs text-cyan-200">{message}</Text>}{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
