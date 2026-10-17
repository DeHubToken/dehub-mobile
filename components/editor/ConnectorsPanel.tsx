import DiagramTemplatesPanel from "./DiagramTemplatesPanel";
import React, { useEffect, useId, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Defs, Marker, Path } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { CONNECTOR_CAPS, CONNECTOR_ROUTES, DEFAULT_CONNECTOR, connectorSvgPath, putConnector, type ConnectorStyle } from "../../libs/editor/connectors";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function ConnectorsPanel({ project, time, selectedId, current, commit, select }: {
  project: ProjectSnapshot; time: number; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void;
}) {
  const { t } = useTranslation();
  const selected = project.clips.find(clip => clip.id === selectedId);
  const existing = selected?.kind === "shape" && (selected.connector || selected.shape === "line" || selected.shape === "arrow") ? selected : undefined;
  const [style, setStyle] = useState<ConnectorStyle>({ ...DEFAULT_CONNECTOR });
  const [colour, setColour] = useState("#ffffff"), [width, setWidth] = useState(6), [dash, setDash] = useState<"solid" | "dashed" | "dotted">("solid");
  const markerId = useId().replace(/:/g, "");
  useEffect(() => {
    if (!existing) return;
    setStyle(existing.connector ?? { route: "straight", start: "none", end: existing.shape === "arrow" ? "arrow" : "none", bend: 0.5 });
    setColour(existing.stroke?.color ?? existing.fill ?? "#ffffff"); setWidth(existing.stroke?.width ?? 6);
    setDash(existing.stroke?.dash?.length ? (existing.stroke.dash[0] <= 2 ? "dotted" : "dashed") : "solid");
  }, [existing?.id, existing?.connector, existing?.stroke]);
  const chip = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white" : "border-white/20"}`}><Text className={`text-xs ${active ? "text-black" : "text-white/75"}`}>{label}</Text></Pressable>;
  const capNames = { none: "None", arrow: "Arrow", circle: "Circle", diamond: "Diamond" }, validColour = /^#[\da-f]{6}$/i.test(colour);
  const previewColour = validColour ? colour : "#ffffff";
  const marker = (cap: ConnectorStyle["start"], id: string) => cap !== "none" && <Marker id={id} viewBox="0 0 10 10" refX={10} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse">{cap === "circle" ? <Circle cx={5} cy={5} r={4} fill={previewColour} /> : <Path d={cap === "diamond" ? "M 10 5 L 5 0 L 0 5 L 5 10 Z" : "M 10 5 L 0 0 L 2 5 L 0 10 Z"} fill={previewColour} />}</Marker>;
  return <View className="px-3" style={{ gap: 10 }}>
    <View className="rounded-lg border border-white/10 bg-white/5"><Svg viewBox="-75 -35 150 70" width="100%" height={100} accessible accessibilityLabel={t("editor.connectors.preview", { defaultValue: "Connector preview" })}><Defs>{marker(style.start, `${markerId}-start`)}{marker(style.end, `${markerId}-end`)}</Defs><Path d={connectorSvgPath(110, 30, style)} fill="none" stroke={previewColour} strokeWidth={Math.max(1, width / 3)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash === "solid" ? undefined : dash === "dashed" ? [7, 5] : [1, 5]} markerStart={style.start !== "none" ? `url(#${markerId}-start)` : undefined} markerEnd={style.end !== "none" ? `url(#${markerId}-end)` : undefined} /></Svg></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{CONNECTOR_ROUTES.map(route => chip(t(`editor.connectors.route.${route}`, { defaultValue: ({ straight: "Straight", elbow: "Elbow", curve: "Curved" })[route] }), style.route === route, () => setStyle(value => ({ ...value, route }))))}</View>
    {(["start", "end"] as const).map(edge => <View key={edge} style={{ gap: 8 }}><Text className="text-xs text-white/60">{t(`editor.connectors.${edge}`, { defaultValue: edge === "start" ? "Start endpoint" : "End endpoint" })}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>{CONNECTOR_CAPS.map(cap => chip(t(`editor.connectors.cap.${cap}`, { defaultValue: capNames[cap] }), style[edge] === cap, () => setStyle(value => ({ ...value, [edge]: cap }))))}</View></View>)}
    <Text className="text-xs text-white/60">{t("editor.connectors.colour", { defaultValue: "Line colour" })}</Text><TextInput value={colour} onChangeText={setColour} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.connectors.colour", { defaultValue: "Line colour" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <Text className="text-xs text-white/60">{t("editor.connectors.width", { defaultValue: "Line weight" })}: {width}</Text><Slider minimumValue={1} maximumValue={40} step={1} value={width} onValueChange={setWidth} accessibilityLabel={t("editor.connectors.width", { defaultValue: "Line weight" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" />
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["solid", "dashed", "dotted"] as const).map(value => chip(t(`editor.connectors.stroke.${value}`, { defaultValue: ({ solid: "Solid", dashed: "Dashed", dotted: "Dotted" })[value] }), dash === value, () => setDash(value)))}</View>
    {style.route !== "straight" && <><Text className="text-xs text-white/60">{t("editor.connectors.bend", { defaultValue: "Bend position" })}: {Math.round(style.bend * 100)}%</Text><Slider minimumValue={10} maximumValue={90} step={1} value={Math.round(style.bend * 100)} onValueChange={value => setStyle(before => ({ ...before, bend: value / 100 }))} accessibilityLabel={t("editor.connectors.bend", { defaultValue: "Bend position" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" /></>}
    <Pressable accessibilityRole="button" disabled={!!existing?.locked || !validColour} onPress={() => { const latest = current(); if (!latest || latest.id !== project.id) return; const result = putConnector(latest, time, style, colour, width, dash === "solid" ? [] : dash === "dashed" ? [width * 3, width * 2] : [1, width * 2], () => newId(10), existing?.id); if (result) { commit(result.project); select(result.id); } }} className="min-h-[40px] items-center justify-center rounded-lg bg-white px-3" style={{ opacity: existing?.locked || !validColour ? 0.35 : 1 }}><Text className="text-xs font-medium text-black">{t(existing ? "editor.connectors.update" : "editor.connectors.insert", { defaultValue: existing ? "Update connector" : "Insert connector" })}</Text></Pressable>
    <Text className="text-xs text-white/45">{t("editor.connectors.hint", { defaultValue: "Resize, stretch, rotate, or flip the connector on the canvas. Choose it again to edit its route and endpoints." })}</Text>
    <DiagramTemplatesPanel project={project} current={current} commit={commit} time={time} select={select} />
  </View>;
}
