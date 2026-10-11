/**
 * The one control left on screen once the live viewer's chrome is cleared:
 * a small round button in the bottom corner that flips the picture between
 * portrait and landscape. The web viewer's LiveClearedLayer draws the same.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";

export default function LiveRotateButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      testID="live-rotate"
      accessibilityRole="button"
      accessibilityLabel={t("liveViewer.rotate")}
      onPress={onPress}
      hitSlop={10}
      style={[
        styles.button,
        { right: Math.max(insets.right, 12) + 4, bottom: Math.max(insets.bottom, 12) + 4 },
      ]}
    >
      <Icon name="RotateCw" size={18} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
});
