import { pixelsPerUnit } from "../../libs/editor/documentDimensions";
import type { GuideUnit } from "../../libs/editor/designGuides";
import React from "react";
import { Text, View } from "react-native";
import { designRulerMarks } from "../../libs/editor/designRulers";

export default function DesignRulers({ width, height, viewWidth, viewHeight, zoom = 1, rulerUnit = "px", dpi = 96 }: { rulerUnit?: GuideUnit; dpi?: number; width: number; height: number; viewWidth: number; viewHeight: number; zoom?: number }) {
  const unit = 1 / zoom;
  return <View pointerEvents="none" accessible={false} style={{ position: "absolute", top: 0, left: 0, width: viewWidth, height: viewHeight }}>
    <View style={{ position: "absolute", top: -18 * unit, left: 0, width: viewWidth, height: 18 * unit, overflow: "hidden", backgroundColor: "#111111", borderBottomWidth: unit, borderBottomColor: "#555555" }}>{designRulerMarks(width, viewWidth * zoom, pixelsPerUnit(rulerUnit, dpi)).map(mark => <View key={mark.value} style={{ position: "absolute", left: mark.position * viewWidth, bottom: 0, height: (mark.major ? 8 : 4) * unit, borderLeftWidth: unit, borderLeftColor: "#777777" }}>{mark.major && <Text style={{ position: "absolute", top: -8 * unit, left: 2 * unit, width: 40 * unit, color: "#aaaaaa", fontSize: 8 * unit, lineHeight: 9 * unit }}>{mark.value}</Text>}</View>)}</View>
    <View style={{ position: "absolute", top: 0, left: -18 * unit, height: viewHeight, width: 18 * unit, overflow: "hidden", backgroundColor: "#111111", borderRightWidth: unit, borderRightColor: "#555555" }}>{designRulerMarks(height, viewHeight * zoom, pixelsPerUnit(rulerUnit, dpi)).map(mark => <View key={mark.value} style={{ position: "absolute", top: mark.position * viewHeight, right: 0, width: (mark.major ? 8 : 4) * unit, borderTopWidth: unit, borderTopColor: "#777777" }}>{mark.major && <Text style={{ position: "absolute", top: 2 * unit, right: 0, width: 18 * unit, color: "#aaaaaa", fontSize: 7 * unit, lineHeight: 9 * unit }}>{mark.value}</Text>}</View>)}</View>
    <View style={{ position: "absolute", top: -18 * unit, left: -18 * unit, width: 18 * unit, height: 18 * unit, alignItems: "center", justifyContent: "center", backgroundColor: "#111111" }}><Text style={{ fontSize: 8 * unit, color: "#888888" }}>{rulerUnit}</Text></View>
  </View>;
}
