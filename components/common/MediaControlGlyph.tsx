import React from "react";
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from "react-native";
import Icon, { type IconName } from "../ui/Icon";

// The same dark outline under every white video control, with no button frame.
export function MediaControlIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <View style={{ width: size, height: size }}>
    <View style={StyleSheet.absoluteFill}><Icon name={name} size={size} color="rgba(0,0,0,0.45)" strokeWidth={4} /></View>
    <Icon name={name} size={size} color="#FFFFFF" />
  </View>;
}

export function MediaControlText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <View style={{ position: "relative", alignItems: "center" }}>
    {[[ -0.7, 0 ], [ 0.7, 0 ], [ 0, -0.7 ], [ 0, 0.7 ]].map(([x, y], i) =>
      <Text key={i} accessible={false} importantForAccessibility="no" style={[style, styles.textOutline, { transform: [{ translateX: x }, { translateY: y }] }]}>{children}</Text>)}
    <Text style={[style, { color: "#FFFFFF" }]}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  textOutline: { position: "absolute", top: 0, left: 0, right: 0, color: "rgba(0,0,0,0.45)", textAlign: "center", textShadowColor: "transparent", textShadowRadius: 0 },
});
