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

const BEAD_SHOULDER = 8;
const BEAD_HEIGHT = 28;
const BEAD_CORNER = 12;
const BEAD_FACE = 18;
const BEAD_FACE_OVERLAP = 6;

/** The bead's outline: concave shoulders off the bar's bottom edge, then a
 *  rounded tab. `open` leaves the top unstroked so it joins the bar's rim. */
function beadPath(width: number, square: boolean, open = false) {
  const f = square ? 0 : BEAD_SHOULDER;
  const r = square ? 0 : BEAD_CORNER;
  const tab = width - f * 2;
  const top = open ? 0.5 : 0;
  const bottom = open ? BEAD_HEIGHT - 0.5 : BEAD_HEIGHT;
  return `M0,${top}Q${f},${top} ${f},${f}V${BEAD_HEIGHT - r}A${r},${r} 0 0 0 ${f + r},${bottom}H${f + tab - r}A${r},${r} 0 0 0 ${f + tab},${BEAD_HEIGHT - r}V${f}Q${f + tab},${top} ${width},${top}${open ? "" : "Z"}`;
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
 *  as part of it. Android paints it in the pill's solid colour; iOS masks the
 *  pill's own glass to the bead's shape. */
export default function NewPostsBead({ count, authors, islandChrome, onPress, label }: {
  count: number;
  authors: NewPostAuthor[];
  islandChrome: boolean;
  onPress: () => void;
  label: string;
}) {
  const { isMinimal, skin } = useAppTheme();
  const square = !!(skin?.square || isMinimal);
  const f = square ? 0 : BEAD_SHOULDER;
  const [contentWidth, setContentWidth] = useState(56);
  const width = f * 2 + contentWidth + 18;
  const faces = authors.slice(0, 3);
  const rim = isMinimal ? MINIMAL_TAB_LINE : String(skin?.barBorder?.borderColor ?? "rgba(255,255,255,0.22)");
  const tint = islandChrome
    ? glassTint(String(skin?.barFill.backgroundColor ?? "#18181B"), 0.22)
    : skin ? glassTint(String(skin.strip.backgroundColor), 0.22) : "rgba(20, 20, 24, 0.18)";
  const solid = isMinimal ? "#000" : overPillBase(tint);
  const ink = skin?.tabIconActive ?? "#FFFFFF";
  return (
    <View pointerEvents="box-none" style={{ width, height: BEAD_HEIGHT + 1 }}>
      <Svg pointerEvents="none" width={width} height={BEAD_HEIGHT + 1} style={StyleSheet.absoluteFill}>
        <Path d={beadPath(width, square)} fill={solid} />
      </Svg>
      {Platform.OS === "ios" && !isMinimal ? (
        <MaskedView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          maskElement={<Svg width={width} height={BEAD_HEIGHT + 1}><Path d={beadPath(width, square)} fill="#000" /></Svg>}
        >
          <NewPostsMaterial radius={0} islandChrome={islandChrome} />
        </MaskedView>
      ) : null}
      <Svg pointerEvents="none" width={width} height={BEAD_HEIGHT + 1} style={StyleSheet.absoluteFill}>
        <Path d={beadPath(width, square, true)} fill="none" stroke={rim} strokeWidth={1} />
      </Svg>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={{ position: "absolute", left: f, top: 0, width: width - f * 2, height: BEAD_HEIGHT, alignItems: "center", justifyContent: "center" }}
      >
        <View
          onLayout={(e) => setContentWidth(Math.ceil(e.nativeEvent.layout.width))}
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          {faces.length > 0 ? (
            <View style={{ flexDirection: "row" }}>
              {faces.map((author, i) => (
                <View
                  key={author.address}
                  style={{
                    width: BEAD_FACE, height: BEAD_FACE, borderRadius: 6, overflow: "hidden",
                    marginLeft: i ? -BEAD_FACE_OVERLAP : 0, zIndex: 3 - i,
                    borderWidth: 1.5, borderColor: solid, backgroundColor: solid,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {author.avatar ? (
                    <Image source={{ uri: getAvatarUrl(author.avatar, BEAD_FACE) }} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={{ color: ink, fontSize: 9, fontWeight: "700" }}>{author.name.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={{ color: ink, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>+{count}</Text>
        </View>
      </Pressable>
    </View>
  );
}
