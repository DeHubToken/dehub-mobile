import React from "react";
import { Text, View } from "react-native";
import { designRulerMarks } from "../../libs/editor/designRulers";

export default function DesignRulers({ width, height, viewWidth, viewHeight }: { width: number; height: number; viewWidth: number; viewHeight: number }) {
  return <View pointerEvents="none" accessible={false} style={{ position: "absolute", top: 0, left: 0, width: viewWidth, height: viewHeight }}>
    <View style={{ position: "absolute", top: -18, left: 0, width: viewWidth, height: 18, overflow: "hidden", backgroundColor: "#111111", borderBottomWidth: 1, borderBottomColor: "#555555" }}>{designRulerMarks(width, viewWidth).map(mark => <View key={mark.value} style={{ position: "absolute", left: mark.position * viewWidth, bottom: 0, height: mark.major ? 8 : 4, borderLeftWidth: 1, borderLeftColor: "#777777" }}>{mark.major && <Text style={{ position: "absolute", top: -8, left: 2, width: 40, color: "#aaaaaa", fontSize: 8, lineHeight: 9 }}>{mark.value}</Text>}</View>)}</View>
    <View style={{ position: "absolute", top: 0, left: -18, height: viewHeight, width: 18, overflow: "hidden", backgroundColor: "#111111", borderRightWidth: 1, borderRightColor: "#555555" }}>{designRulerMarks(height, viewHeight).map(mark => <View key={mark.value} style={{ position: "absolute", top: mark.position * viewHeight, right: 0, width: mark.major ? 8 : 4, borderTopWidth: 1, borderTopColor: "#777777" }}>{mark.major && <Text style={{ position: "absolute", top: 2, right: 0, width: 18, color: "#aaaaaa", fontSize: 7, lineHeight: 9 }}>{mark.value}</Text>}</View>)}</View>
    <View style={{ position: "absolute", top: -18, left: -18, width: 18, height: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#111111" }}><Text style={{ fontSize: 8, color: "#888888" }}>px</Text></View>
  </View>;
}
