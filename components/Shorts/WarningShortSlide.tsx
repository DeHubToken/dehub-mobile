/**
 * A warned clip in the shorts viewer, before the person chooses to see it.
 *
 * The creator's warning over a blurred still, with one button to play it.
 * Nothing plays and nothing behind it is readable, the same promise the
 * warning makes on a feed card (ContentWarningGate), and the slide is a plain
 * view so swiping past it works like any other short.
 */
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";

interface Props {
  text: string;
  thumbnail?: string;
  height: number;
  onReveal: () => void;
}

function WarningShortSlide({ text, thumbnail, height, onReveal }: Props) {
  const { t } = useTranslation();
  return (
    <View className="dark-surface" style={[styles.slide, { height }]}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} transition={0} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />
      <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`${t("contentWarning.label")}: ${text}`}>
        <Ionicons name="warning-outline" size={28} color="#FCD34D" />
        <Text style={styles.label}>{t("contentWarning.label")}</Text>
        <Text style={styles.text}>{text}</Text>
        <Pressable onPress={onReveal} hitSlop={10} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>{t("contentWarning.show")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default memo(WarningShortSlide);

const styles = StyleSheet.create({
  slide: { width: "100%", backgroundColor: "#000", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  dim: { backgroundColor: "rgba(0,0,0,0.45)" },
  card: { alignItems: "center", gap: 10, paddingHorizontal: 32, maxWidth: 360 },
  label: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
  text: { color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center" },
  button: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
