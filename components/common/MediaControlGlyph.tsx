import React from "react";
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import { renderCutIconOutline } from "../ui/cut-icons";

// Active controls invert the white glyph and dark outline, with no button frame.
export function MediaControlIcon({ name, size = 18, active = false, plain = false }: { name: IconName; size?: number; active?: boolean; plain?: boolean }) {
  if (plain) {
    const color = active ? '#b8d5ff' : '#FFFFFF';
    return <Icon name={name} size={size} color={color} strokeWidth={1.75} />;
  }
  const foreground = active ? "#000000" : "#FFFFFF";
  const outlineColor = active ? "#FFFFFF" : "rgba(0,0,0,0.8)";
  return <View style={{ width: size, height: size }}>
  </View>;
}

export function MediaControlText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <View style={{ position: "relative", alignItems: "center" }}>
    {[[ -0.5, 0 ], [ 0.5, 0 ], [ 0, -0.5 ], [ 0, 0.5 ]].map(([x, y], i) =>
      <Text key={i} accessible={false} importantForAccessibility="no" style={[style, styles.textOutline, { transform: [{ translateX: x }, { translateY: y }] }]}>{children}</Text>)}
    <Text style={[style, { color: "#FFFFFF" }]}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  textOutline: { position: "absolute", top: 0, left: 0, right: 0, color: "rgba(0,0,0,0.8)", textAlign: "center", textShadowColor: "transparent", textShadowRadius: 0 },
});
