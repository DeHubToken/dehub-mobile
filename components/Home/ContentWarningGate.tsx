import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "@expo/vector-icons/Ionicons";

/** The server's limit (dehub-stream-backend src/nft/content-warning). */
export const CONTENT_WARNING_MAX = 200;

/**
 * Whether a post opens collapsed behind its content warning, and the switch
 * that opens it. Per card, reset when the card is reused for another post —
 * same contract as useMatureGate.
 */
export function useContentWarning(spoilerText?: string, resetKey?: string) {
  const text = spoilerText?.trim() || "";
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { setRevealed(false); }, [resetKey]);
  const reveal = useCallback(() => setRevealed(true), []);
  return { text, hidden: !!text && !revealed, reveal };
}

/**
 * The warning in place of a post: the creator's one line and a button to open
 * it. Covers media and caption together, the way Mastodon does, so neither
 * gives away what the warning is about.
 */
export default function ContentWarningGate({ text, onReveal }: { text: string; onReveal: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.box} accessibilityRole="summary" accessibilityLabel={`${t("contentWarning.label")}: ${text}`}>
      <Ionicons name="warning-outline" size={20} color="#FCD34D" />
      <Text style={styles.text}>{text}</Text>
      <Pressable onPress={onReveal} hitSlop={8} accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonText}>{t("contentWarning.show")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.25)",
    backgroundColor: "rgba(251,191,36,0.10)",
  },
  text: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" },
  button: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
