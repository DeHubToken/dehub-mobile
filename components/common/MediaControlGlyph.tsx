import Svg, { Rect, Path } from 'react-native-svg';
import React, { createContext, useContext } from "react";
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { KeepDarkScope } from "../../libs/jsx/tone";
import Icon, { type IconName } from "../ui/Icon";
import { renderCutIconOutline } from "../ui/cut-icons";

/**
 * What the controls sit on. "picture": over the video, white glyphs in every
 * theme. "paper": the control strip under a post page video in System Light,
 * which is part of the page, so its glyphs are ink.
 */
export type MediaControlGround = "picture" | "paper";
const Ground = createContext<MediaControlGround>("picture");
export const MediaControlGroundProvider = Ground.Provider;
export const PAPER_INK = "#0B0B0D";

/** Text drawn in the controls (time, speed): white on a picture, ink on paper. */
export function MediaControlLabel({ style, children }: { style?: StyleProp<TextStyle>; children: React.ReactNode }) {
  const paper = useContext(Ground) === "paper";
  return <KeepDarkScope><Text style={[style, paper && { color: PAPER_INK, textShadowColor: "transparent", textShadowRadius: 0 }]}>{children}</Text></KeepDarkScope>;
}

// Active controls invert the white glyph and dark outline, with no button frame.
// Kept out of System Light's colour pass: these are drawn for a picture, and the
// pass turned them into black glyphs with a white outline.
export function MediaControlIcon(props: { name: IconName; size?: number; active?: boolean; plain?: boolean }) {
  return <KeepDarkScope><MediaControlGlyph {...props} /></KeepDarkScope>;
}

function MediaControlGlyph({ name, size = 18, active = false, plain = false }: { name: IconName; size?: number; active?: boolean; plain?: boolean }) {
  const paper = useContext(Ground) === "paper";
  if (plain) {
    const ink = paper ? PAPER_INK : "#FFFFFF";
    return <View style={{ width: size, height: size }}>
      <Icon name={name} size={size} color={ink} strokeWidth={1.75} />
      {active && <View testID="video-active-dot" pointerEvents="none" style={{ position: 'absolute', bottom: -5, left: (size - 3) / 2, width: 3, height: 3, borderRadius: 1.5, backgroundColor: ink }} />}
    </View>;
  }
  const foreground = active ? "#000000" : "#FFFFFF";
  const outlineColor = active ? "#FFFFFF" : "rgba(0,0,0,0.8)";
  const caption = (outline: boolean) => <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={outline ? outlineColor : foreground} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3} y={5} width={18} height={14} rx={2} strokeWidth={outline ? 3 : 1.75} />
    <Path d="M10 9H8a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2M17 9h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2" strokeWidth={outline ? 2.5 : 1.25} />
  </Svg>;
  return <View style={{ width: size, height: size }}>
    <View style={StyleSheet.absoluteFill}>{name === "Captions" ? caption(true) : renderCutIconOutline(name, size, outlineColor) ?? <Icon name={name} size={size} color={outlineColor} strokeWidth={3} />}</View>
    {name === "Captions" ? caption(false) : <Icon name={name} size={size} color={foreground} strokeWidth={1.75} />}
  </View>;
}

export function MediaControlText({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <KeepDarkScope><View style={{ position: "relative", alignItems: "center" }}>
    {[[ -0.5, 0 ], [ 0.5, 0 ], [ 0, -0.5 ], [ 0, 0.5 ]].map(([x, y], i) =>
      <Text key={i} accessible={false} importantForAccessibility="no" style={[style, styles.textOutline, { transform: [{ translateX: x }, { translateY: y }] }]}>{children}</Text>)}
    <Text style={[style, { color: "#FFFFFF" }]}>{children}</Text>
  </View></KeepDarkScope>;
}

const styles = StyleSheet.create({
  textOutline: { position: "absolute", top: 0, left: 0, right: 0, color: "rgba(0,0,0,0.8)", textAlign: "center", textShadowColor: "transparent", textShadowRadius: 0 },
});
