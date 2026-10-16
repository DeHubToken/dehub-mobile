import React, { useEffect, useRef } from "react";
import { Keyboard, Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { cancelDesignColourPick, getDesignColourPick, startDesignColourPick, useDesignColourPick } from "../../libs/editor/designColourPicker";

export default function ColourPickerButton({ projectId, onPick, label }: { projectId: string; onPick: (colour: string) => void; label?: string }) {
  const { t } = useTranslation(), state = useDesignColourPick(), token = useRef<number | null>(null), receive = useRef(onPick); receive.current = onPick;
  const active = state?.projectId === projectId && state.token === token.current;
  useEffect(() => () => { if (getDesignColourPick()?.projectId === projectId && token.current !== null) cancelDesignColourPick(token.current); }, [projectId]);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { Keyboard.dismiss(); if (active && token.current !== null) cancelDesignColourPick(token.current); else token.current = startDesignColourPick(projectId, colour => receive.current(colour)); }} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className={`text-xs ${active ? "text-cyan-100" : "text-white/65"}`}>{active ? t("editor.colourPicker.cancel", { defaultValue: "Cancel colour picker" }) : label || t("editor.colourPicker.pick", { defaultValue: "Pick from canvas" })}</Text></Pressable>;
}
