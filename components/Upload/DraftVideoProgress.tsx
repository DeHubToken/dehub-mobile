import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { draftVideoState } from "../../services/draftVideo";

/**
 * The bar under the composer's video while it uploads and the server prepares
 * it. Informational only — Post never waits on it. Hidden when there is no
 * usable draft, since the post then uploads the file itself.
 *
 * Written in dark values like the rest of the app; System Light's tone pass
 * turns the whites to ink.
 */
function DraftVideoProgress({ draftKey }: { draftKey: string | null }) {
  const { t } = useTranslation();
  const app = useAppTheme();
  const { drafts } = useSnapshot(draftVideoState);
  const draft = draftKey ? drafts[draftKey] : undefined;
  if (!draft || draft.phase === "failed" || draft.phase === "unusable") return null;

  // Canvas themes fill with their own colour, as their pills do; System and
  // Minimal stay monochrome.
  const flat = app.isMinimal || ((app.theme === "system" || app.theme === "immersive") && !app.skin);
  const fill = flat || !app.accent ? "#FFFFFF" : `rgb(${app.accent[0]},${app.accent[1]},${app.accent[2]})`;

  const ready = draft.phase === "ready";
  const uploading = draft.phase === "uploading";
  const percent = ready
    ? 100
    : uploading
      ? Math.min(Math.round(draft.uploadProgress * 100), 100)
      : Math.min(Math.round(draft.processProgress), 99);
  const label = ready ? t("upload.draftReady") : uploading ? t("upload.stageUploading") : t("upload.draftPreparing");

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(percent, 2)}%`, backgroundColor: fill }]} />
      </View>
      <View style={styles.row}>
        <View style={styles.left}>
          {ready && <Icon name="Check" size={12} color={fill} />}
          <Text style={[styles.label, ready && styles.labelReady, ready && styles.labelAfterIcon]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={styles.percent}>{percent}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  label: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  labelReady: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  labelAfterIcon: {
    marginLeft: 4,
  },
  percent: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontVariant: ["tabular-nums"],
    marginLeft: 8,
  },
});

export default memo(DraftVideoProgress);
