import React, { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Path } from "react-native-svg";
import NavPillSurface from "../ui/NavPillSurface";
import FrostedPill from "../ui/FrostedPill";
import HudBrackets from "../theme/HudBrackets";
import { GRAIN, glassTint } from "../../theme/skins";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";
import { getAvatarUrl } from "../../libs/misc";
import { KeepDarkScope } from "../../libs/jsx/tone";
import type { NewPostAuthor } from "../../hooks/useNewPostsSignal";

/** Match the feed nav's finish, including each skin's tint and texture. */
function NewPostsMaterial({ radius, islandChrome, brackets = false }: { radius: number; islandChrome: boolean; brackets?: boolean }) {
  const { isMinimal, skin } = useAppTheme();
  if (islandChrome) return <NavPillSurface borderRadius={radius} />;
  if (isMinimal) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", borderColor: MINIMAL_TAB_LINE, borderWidth: 1, borderRadius: 0 }]} />;
  return (
    <>
      <FrostedPill
        tint={skin ? glassTint(String(skin.strip.backgroundColor), 0.22) : "rgba(20, 20, 24, 0.18)"}
        borderRadius={radius}
      />
      {skin ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, skin.strip, { backgroundColor: "transparent", borderRadius: radius }]} /> : null}
      {skin?.grain ? <Image source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { borderRadius: radius }]} /> : null}
      {skin?.brackets && brackets ? <HudBrackets color={skin.brackets} /> : null}
    </>
  );
}

const BEAD_SHOULDER = 10;
/** The tab's height below the pill. */
export const BEAD_HEIGHT = 34;
/** How far the bead reaches up over the pill's bottom edge. Its fill covers
 *  the pill's rim there, so pill and bead read as one piece with no seam. */
export const BEAD_JOIN = 2;
const BEAD_CORNER = 14;
const BEAD_FACE = 22;
const BEAD_FACE_OVERLAP = 7;
const TOTAL_HEIGHT = BEAD_JOIN + BEAD_HEIGHT;

/** The bead's outline: a strip over the pill's bottom edge, concave shoulders
 *  off it, then a rounded tab. `open` strokes only the shoulders and tab,
 *  starting where the pill's own rim runs, so the two outlines are one line. */
function beadPath(width: number, square: boolean, open = false) {
  const f = square ? 0 : BEAD_SHOULDER;
  const r = square ? 0 : BEAD_CORNER;
  const right = width - f;
  const rim = BEAD_JOIN - 0.5;
  const T = TOTAL_HEIGHT;
  if (open) {
    const b = T - 0.5;
    return `M0,${rim}Q${f},${rim} ${f},${rim + f}V${T - r}A${r},${r} 0 0 0 ${f + r},${b}H${right - r}A${r},${r} 0 0 0 ${right},${T - r}V${rim + f}Q${right},${rim} ${width},${rim}`;
  }
  return `M0,0H${width}V${rim}Q${right},${rim} ${right},${rim + f}V${T - r}A${r},${r} 0 0 1 ${right - r},${T}H${f + r}A${r},${r} 0 0 1 ${f},${T - r}V${rim + f}Q${f},${rim} 0,${rim}Z`;
}

/** An rgba tint laid over the pill's #18181B base, as one opaque colour. */
function overPillBase(tint: string, lift = 0) {
  const m = tint.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?/i);
  const base = [24, 24, 27];
  if (!m) return tint;
  const a = m[4] == null ? 1 : Number(m[4]);
  const mix = [1, 2, 3].map((i, k) => base[k] * (1 - a) + Number(m[i]) * a);
  return `rgb(${mix.map(v => Math.round(v + (255 - v) * lift)).join(",")})`;
}

/** "+N" with up to three faces, hanging off the bottom of the feed nav pill
 *  as part of it. Drawn over the pill (HomeScreen), reaching BEAD_JOIN up
 *  over its bottom edge. Android paints it in the pill's solid colour; iOS
 *  masks the pill's own glass to the bead's shape. */
export default function NewPostsBead({ count, authors, islandChrome, onPress, label }: {
  count: number;
  authors: NewPostAuthor[];
  islandChrome: boolean;
  onPress: () => void;
  label: string;
}) {
  const { isMinimal, isLight, skin } = useAppTheme();
  const square = !!(skin?.square || isMinimal);
  const lightFrost = isLight && !skin && !isMinimal;
  const f = square ? 0 : BEAD_SHOULDER;
  const [contentWidth, setContentWidth] = useState(72);
  const width = f * 2 + contentWidth + 24;
  const faces = authors.slice(0, 3);
  const rim = lightFrost ? "rgba(11,11,13,0.10)"
    : isMinimal ? MINIMAL_TAB_LINE
    : skin ? String(skin.barBorder?.borderColor ?? "rgba(255,255,255,0.22)")
    : islandChrome ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.22)";
  // The system pill's rim is two hairlines wide (FrostedPill); match it.
  const rimWidth = !skin && !isMinimal && !islandChrome && !lightFrost ? StyleSheet.hairlineWidth * 2 : 1;
  const tint = islandChrome
    ? glassTint(String(skin?.barFill.backgroundColor ?? "#18181B"), 0.22)
    : skin ? glassTint(String(skin.strip.backgroundColor), 0.22) : "rgba(20, 20, 24, 0.18)";
  const solid = lightFrost ? "#F4F4F7" : isMinimal ? "#000" : overPillBase(tint);
  const ink = lightFrost ? "#0B0B0D" : skin?.tabIconActive ?? "#FFFFFF";
  const bead = (
    <View pointerEvents="box-none" style={{ width, height: TOTAL_HEIGHT }}>
      <Svg pointerEvents="none" width={width} height={TOTAL_HEIGHT} style={StyleSheet.absoluteFill}>
        <Path d={beadPath(width, square)} fill={solid} />
      </Svg>
      {Platform.OS === "ios" && !isMinimal ? (
        <MaskedView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          maskElement={<Svg width={width} height={TOTAL_HEIGHT}><Path d={beadPath(width, square)} fill="#000" /></Svg>}
        >
          <NewPostsMaterial radius={0} islandChrome={islandChrome} />
        </MaskedView>
      ) : null}
      <Svg pointerEvents="none" width={width} height={TOTAL_HEIGHT} style={StyleSheet.absoluteFill}>
        <Path d={beadPath(width, square, true)} fill="none" stroke={rim} strokeWidth={rimWidth} strokeLinecap="round" />
      </Svg>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        style={({ pressed }) => ({ position: "absolute", left: f, top: BEAD_JOIN, width: width - f * 2, height: BEAD_HEIGHT, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
      >
        <View
          onLayout={(e) => setContentWidth(Math.ceil(e.nativeEvent.layout.width))}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          {faces.length > 0 ? (
            <View style={{ flexDirection: "row" }}>
              {faces.map((author, i) => (
                <View
                  key={author.address}
                  style={{
                    width: BEAD_FACE, height: BEAD_FACE, borderRadius: square ? 0 : 7, overflow: "hidden",
                    marginLeft: i ? -BEAD_FACE_OVERLAP : 0, zIndex: 3 - i,
                    borderWidth: 1.5, borderColor: solid, backgroundColor: solid,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {author.avatar ? (
                    <Image source={{ uri: getAvatarUrl(author.avatar, BEAD_FACE) }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={{ color: ink, fontSize: 10, fontWeight: "700" }}>{author.name.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={{ color: ink, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>+{count}</Text>
        </View>
      </Pressable>
    </View>
  );
  // System Light's pill is pale frost written in light colours (FrostedPill);
  // keep the bead's out of the colour pass so the two match exactly.
  return lightFrost ? <KeepDarkScope>{bead}</KeepDarkScope> : bead;
}
