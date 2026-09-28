import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

/**
 * War's HUD corner brackets (web: the gradient corners in war-nav.css), drawn
 * as eight hairlines over the parent's corners. Parent must be positioned.
 */
const HudBrackets: React.FC<{ color: string; length?: number; width?: number }> = ({
  color,
  length = 12,
  width = 1.5,
}) => {
  const h = { position: "absolute" as const, width: length, height: width, backgroundColor: color };
  const v = { position: "absolute" as const, width, height: length, backgroundColor: color };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[h, { top: 0, left: 0 }]} />
      <View style={[v, { top: 0, left: 0 }]} />
      <View style={[h, { top: 0, right: 0 }]} />
      <View style={[v, { top: 0, right: 0 }]} />
      <View style={[h, { bottom: 0, left: 0 }]} />
      <View style={[v, { bottom: 0, left: 0 }]} />
      <View style={[h, { bottom: 0, right: 0 }]} />
      <View style={[v, { bottom: 0, right: 0 }]} />
    </View>
  );
};

export default memo(HudBrackets);
