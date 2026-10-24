import React, { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * The ALT pill on a described photo or video. The description is already the
 * image's accessibility label for screen readers; this is the same text for
 * everybody else, a tap away — the way Mastodon shows it. Tapping the text
 * puts it away again.
 */
export default function AltTextBadge({ text }: { text?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const description = text?.trim();
  if (!description) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(value => !value)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("altText.show")}
        style={styles.badge}
      >
        <Text style={styles.badgeText}>{t("altText.badge")}</Text>
      </Pressable>
      {open && (
        <Pressable onPress={() => setOpen(false)} style={styles.panel} accessibilityRole="text">
          <Text style={styles.panelText}>{description}</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 5,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  panel: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    zIndex: 6,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: 10,
    padding: 10,
  },
  panelText: { color: "#fff", fontSize: 13, lineHeight: 18 },
});
