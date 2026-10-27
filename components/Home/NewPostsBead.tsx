import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import NavPillSurface from "../ui/NavPillSurface";
import FrostedPill, { LIGHT_PILL_SHADOW } from "../ui/FrostedPill";
import { GRAIN, glassTint } from "../../theme/skins";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";
import { getAvatarUrl } from "../../libs/misc";
import { KeepDarkScope } from "../../libs/jsx/tone";
import type { NewPostAuthor } from "../../hooks/useNewPostsSignal";

/** Space between the pill's bottom edge and the chip. */
export const CHIP_GAP = 8;
/** The chip's height. */
export const CHIP_HEIGHT = 34;
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

function ArrowUp({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
      <Path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

/** "N new posts" with up to three faces: a small glass capsule floating just
 *  under the feed nav pill, in the pill's own material. HomeScreen clips its
 *  slot at the pill's bottom edge, so it tucks up behind the pill when the
 *  pill hides and drops back out after it returns. */
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
  const radius = square ? 0 : CHIP_HEIGHT / 2;
  const faces = authors.slice(0, 3);
  const ink = lightFrost ? "#0B0B0D" : skin?.tabIconActive ?? "#FFFFFF";
  const ring = lightFrost ? "#FFFFFF" : isMinimal ? "#000" : "rgba(24,24,27,0.9)";
  const chip = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        { borderRadius: radius, opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
        lightFrost ? LIGHT_PILL_SHADOW : styles.darkShadow,
      ]}
    >
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        <ChipMaterial radius={radius} islandChrome={islandChrome} />
        {!lightFrost && !isMinimal ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: skin ? String(skin.barBorder?.borderColor ?? "rgba(255,255,255,0.18)") : "rgba(255,255,255,0.16)", borderTopColor: "rgba(255,255,255,0.34)" }]} />
        ) : null}
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
        <ArrowUp color={ink} />
      </View>
    </Pressable>
  );
  // System Light's pill is pale frost written in light colours (FrostedPill);
  // keep the chip's out of the colour pass so the two match exactly.
  return lightFrost ? <KeepDarkScope>{chip}</KeepDarkScope> : chip;
}

const styles = StyleSheet.create({
  chip: { height: CHIP_HEIGHT, justifyContent: "center", paddingLeft: 6, paddingRight: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  darkShadow: { boxShadow: "0px 8px 22px -8px rgba(0,0,0,0.55)" },
});
