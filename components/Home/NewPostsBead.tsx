import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import NavPillSurface from "../ui/NavPillSurface";
import FrostedPill, { LIGHT_PILL_SHADOW } from "../ui/FrostedPill";
import { GRAIN, glassTint } from "../../theme/skins";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";
import { getAvatarUrl } from "../../libs/misc";
import { KeepDarkScope } from "../../libs/jsx/tone";
import type { NewPostAuthor } from "../../hooks/useNewPostsSignal";

/** Space between the pill's bottom edge and the drawer: none, it is flush. */
export const CHIP_GAP = 0;
/** The drawer's height below the pill. */
export const CHIP_HEIGHT = 36;
const CORNER = 14;
const FACE = 22;
const FACE_OVERLAP = 7;

/** Match the feed nav's finish, including each skin's tint and texture. */
function ChipMaterial({ radius, islandChrome }: { radius: number; islandChrome: boolean }) {
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
    </>
  );
}

/** "N new posts" with up to three faces: a drawer that pulls out from under
 *  the feed nav pill, in the pill's own material. HomeScreen clips its slot
 *  at the pill's bottom edge, so the drawer never covers the pill's border and
 *  nothing shows between them; the pill casts a soft shade onto its top. It
 *  slides back under the pill when the pill hides and pulls back out after
 *  it returns. */
export default function NewPostsBead({ count, authors, islandChrome, onPress, label }: {
  count: number;
  authors: NewPostAuthor[];
  islandChrome: boolean;
  onPress: () => void;
  label: string;
}) {
  const { isMinimal, isLight, skin } = useAppTheme();
  const { t } = useTranslation();
  const square = !!(skin?.square || isMinimal);
  const lightFrost = isLight && !skin && !isMinimal;
  const corner = square ? 0 : CORNER;
  const shape = { borderBottomLeftRadius: corner, borderBottomRightRadius: corner };
  const faces = authors.slice(0, 3);
  const ink = lightFrost ? "#0B0B0D" : skin?.tabIconActive ?? "#FFFFFF";
  const ring = lightFrost ? "#FFFFFF" : isMinimal ? "#000" : "rgba(24,24,27,0.9)";
  const rim = lightFrost ? "rgba(11,11,13,0.10)"
    : isMinimal ? MINIMAL_TAB_LINE
    : skin ? String(skin.barBorder?.borderColor ?? "rgba(255,255,255,0.16)") : "rgba(255,255,255,0.16)";
  const chip = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.chip, shape, { opacity: pressed ? 0.8 : 1 }, lightFrost ? LIGHT_PILL_SHADOW : styles.darkShadow]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, { overflow: "hidden" }]}>
        <ChipMaterial radius={0} islandChrome={islandChrome} />
        {!isMinimal ? (
          <LinearGradient
            colors={lightFrost ? ["rgba(0,0,0,0.10)", "rgba(0,0,0,0)"] : ["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
            style={{ position: "absolute", left: 0, right: 0, top: 0, height: 14 }}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, shape, { borderWidth: 1, borderTopWidth: 0, borderColor: rim }]} />
      </View>
      <View style={styles.row}>
        {faces.length > 0 ? (
          <View style={{ flexDirection: "row" }}>
            {faces.map((author, i) => (
              <View
                key={author.address}
                style={{
                  width: FACE, height: FACE, borderRadius: square ? 0 : 7, overflow: "hidden",
                  marginLeft: i ? -FACE_OVERLAP : 0, zIndex: 3 - i,
                  borderWidth: 1.5, borderColor: ring, backgroundColor: ring,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {author.avatar ? (
                  <Image source={{ uri: getAvatarUrl(author.avatar, FACE) }} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Text style={{ color: ink, fontSize: 10, fontWeight: "700" }}>{author.name.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}
        <Text numberOfLines={1} style={{ color: ink, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{t("feed.newPosts", { count, defaultValue: "{{count}} new posts" })}</Text>
      </View>
    </Pressable>
  );
  // System Light's pill is pale frost written in light colours (FrostedPill);
  // keep the chip's out of the colour pass so the two match exactly.
  return lightFrost ? <KeepDarkScope>{chip}</KeepDarkScope> : chip;
}

const styles = StyleSheet.create({
  chip: { height: CHIP_HEIGHT, minWidth: 180, alignItems: "center", justifyContent: "center", paddingLeft: 8, paddingRight: 14, paddingTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  darkShadow: { boxShadow: "0px 10px 22px -12px rgba(0,0,0,0.6)" },
});
