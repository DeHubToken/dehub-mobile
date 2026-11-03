import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import ComicDeck, { themeFoil } from "../Home/ComicDeck";
import ComicFoil from "../Home/ComicFoil";
import { BORDER_LOOKS, COMIC_BORDERS, COMIC_BORDER_LABEL, type ComicBorder } from "../../libs/comic-borders";

const SWATCH_W = 36;
const SWATCH_H = 52;

/**
 * Pick the strip of foil round a comic's cards: the theme's own foil or one of
 * the presets. The cover is shown as a live card above the swatches, so the
 * creator sees the border on their own art before posting.
 */
export default function ComicBorderPicker({ value, onChange, cover, title, width, disabled }: {
  value: ComicBorder | null;
  onChange: (border: ComicBorder | null) => void;
  /** The first page, for the live preview. Left out, only the swatches show. */
  cover?: string;
  title?: string;
  /** The space the preview card has; the screen width less its margins when left out. */
  width?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const options: (ComicBorder | null)[] = [null, ...COMIC_BORDERS];
  const own = themeFoil(theme);
  const screen = useWindowDimensions();
  const previewW = Math.min(width ?? screen.width - 32, 300);
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <Text style={styles.heading}>{t("comicBorder.title")}</Text>
      {cover ? (
        <View style={{ alignItems: "center" }}>
          <ComicDeck images={[cover]} title={title} width={previewW} border={value ?? undefined} />
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 6, paddingHorizontal: 2 }} accessibilityRole="radiogroup">
        {options.map(option => {
          const selected = option === value;
          const look = option ? BORDER_LOOKS[option] : undefined;
          return (
            <Pressable
              key={option ?? "theme"}
              onPress={() => onChange(option)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              style={{ width: 56, alignItems: "center", gap: 4, opacity: disabled ? 0.5 : 1 }}
            >
              <View style={[styles.swatch, selected && styles.swatchOn]}>
                {look
                  ? <ComicFoil colors={[]} look={look} width={SWATCH_W} height={SWATCH_H} />
                  : <LinearGradient colors={[own[0], own[1], own[0], own[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                <View style={[styles.face, { backgroundColor: (look?.foil ?? own)[3] }]} />
              </View>
              <Text numberOfLines={1} style={[styles.label, selected && { color: "#fff" }]}>
                {t(`comicBorder.${option ? COMIC_BORDER_LABEL[option] : "theme"}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "500" },
  swatch: { width: SWATCH_W, height: SWATCH_H, borderRadius: 6, overflow: "hidden" },
  swatchOn: { borderWidth: 2, borderColor: "#fff", transform: [{ scale: 1.1 }] },
  face: { position: "absolute", top: 3, left: 3, right: 3, bottom: 3, borderRadius: 3 },
  label: { color: "rgba(255,255,255,0.6)", fontSize: 10, textAlign: "center", width: "100%" },
});
