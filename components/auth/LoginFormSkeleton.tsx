import React from "react";
import { View, StyleSheet } from "react-native";
import SkeletonBlock from "../Feed/SkeletonBlock";
import { AUTH_CONTROL_HEIGHT, AUTH_RADIUS, authColors } from "./AuthControls";

/**
 * The sign-in options' shape for the sheet's first frame: email field, button,
 * the "or continue with" line and the row of option discs, at the real sizes
 * (SocialLoginIcons layout="stack"). The sheet starts its slide with this and
 * the real controls land in the same places a frame later, so the slide never
 * waits on building them and nothing moves when they arrive.
 */
export default function LoginFormSkeleton({ discs = 5 }: { discs?: number }) {
  return (
    <View style={{ width: "100%", gap: 18 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ minHeight: 124, gap: 12 }}>
        <SkeletonBlock style={styles.control} />
        <SkeletonBlock style={styles.control} />
      </View>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <SkeletonBlock style={{ width: 84, height: 10, borderRadius: 5 }} />
        <View style={styles.rule} />
      </View>
      <View style={styles.row}>
        {Array.from({ length: discs }, (_, i) => (
          <View key={i} style={styles.option}>
            <SkeletonBlock style={styles.disc} />
            <SkeletonBlock style={{ width: 36, height: 10, borderRadius: 5, marginTop: 2 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: { height: AUTH_CONTROL_HEIGHT, borderRadius: AUTH_RADIUS },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, height: 16 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: authColors.hairline },
  row: { width: "100%", flexDirection: "row", gap: 8 },
  option: { flex: 1, alignItems: "center", gap: 6, minWidth: 0 },
  disc: { width: "100%", maxWidth: 48, aspectRatio: 1, borderRadius: AUTH_RADIUS },
});
