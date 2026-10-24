import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { presentationInkPath, type usePresentationMarkup } from "../../libs/editor/usePresentationMarkup";
type Markup = ReturnType<typeof usePresentationMarkup>;

export default function PresentationMarkup({ markup, width, height, onStart }: { markup: Markup; width: number; height: number; onStart: () => void }) {
  const point = (x: number, y: number) => ({ x: x / Math.max(1, width), y: y / Math.max(1, height) });
  return <View pointerEvents={markup.tool === "none" ? "none" : "auto"} style={{ position: "absolute", left: 0, top: 0, width, height }} onStartShouldSetResponder={() => markup.tool !== "none"} onMoveShouldSetResponder={() => markup.tool !== "none"}
    onResponderGrant={event => { onStart(); markup.begin(point(event.nativeEvent.locationX, event.nativeEvent.locationY)); }}
    onResponderMove={event => markup.move(point(event.nativeEvent.locationX, event.nativeEvent.locationY))}
    onResponderRelease={event => { markup.move(point(event.nativeEvent.locationX, event.nativeEvent.locationY)); markup.end(); }} onResponderTerminate={markup.end}>
    <Svg pointerEvents="none" width={width} height={height}>{[...markup.strokes, ...(markup.active ? [markup.active] : [])].map((stroke, index) => <Path key={index} d={presentationInkPath(stroke.points, width, height)} fill="none" stroke={stroke.colour} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}{markup.pointer && markup.tool === "laser" && <><Circle cx={markup.pointer.x * width} cy={markup.pointer.y * height} r={11} fill="#ef4444" opacity={0.25} /><Circle cx={markup.pointer.x * width} cy={markup.pointer.y * height} r={5} fill="#ef4444" stroke="#ffffff" strokeWidth={1} /></>}</Svg>
  </View>;
}

export function PresentationMarkupTools({ markup, onStart }: { markup: Markup; onStart: () => void }) {
  const { t } = useTranslation();
  const button = (label: string, press: () => void, selected = false, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={press} className={`min-h-[40px] justify-center rounded-lg border px-3 ${selected ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/75">{label}</Text></Pressable>;
  return <View className="border-t border-white/10 px-3 py-2" style={{ gap: 6 }}><ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
    {(["none", "laser", "pen"] as const).map(tool => button(t(`editor.present.markTool.${tool}`, { defaultValue: ({ none: "Navigate", laser: "Laser pointer", pen: "Pen" })[tool] }), () => { onStart(); markup.setTool(tool); }, markup.tool === tool))}
    {markup.tool === "pen" && ["#facc15", "#f87171", "#38bdf8", "#ffffff"].map(colour => <Pressable key={colour} accessibilityRole="button" accessibilityLabel={t("editor.present.inkColour", { defaultValue: "Ink colour {{colour}}", colour })} accessibilityState={{ selected: markup.colour === colour }} onPress={() => markup.setColour(colour)} className={`min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border ${markup.colour === colour ? "border-cyan-300" : "border-white/20"}`}><View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colour }} /></Pressable>)}
    {button(t("editor.present.undoMark", { defaultValue: "Undo mark" }), markup.undo, false, !markup.canUndo)}{button(t("editor.present.clearMarks", { defaultValue: "Clear marks" }), markup.clear, false, !markup.canUndo)}
  </ScrollView>{markup.tool === "pen" && <Text className="text-center text-xs text-white/45">{t("editor.present.temporaryInk", { defaultValue: "Marks clear when you change page" })}</Text>}</View>;
}
