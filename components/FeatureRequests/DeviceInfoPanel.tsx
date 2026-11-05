/**
 * Collapsed "Device info" row on a request card. Rendered for the board owners
 * only, and only on requests that came with a snapshot. Mirrors web's
 * FeatureDeviceInfo.
 */
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFeatureDeviceInfo } from "../../hooks/useFeatureRequests";
import { Collapsible, CollapsibleChevron } from "../ui/Collapsible";

const FIELDS: [key: string, label: string][] = [
  ["source", "Sent from"],
  ["app_version", "App version"],
  ["build", "Build"],
  ["update", "OTA update"],
  ["update_published", "OTA published"],
  ["runtime", "Runtime"],
  ["channel", "Channel"],
  ["os", "OS"],
  ["device", "Device"],
  ["browser", "Browser"],
  ["mobile", "Phone or tablet"],
  ["installed_app", "Installed web app"],
  ["screen", "Screen"],
  ["viewport", "Window"],
  ["pixel_ratio", "Pixel ratio"],
  ["font_scale", "Font scale"],
  ["theme", "Theme"],
  ["dark_mode", "System dark mode"],
  ["reduced_motion", "Reduce motion"],
  ["language", "Language"],
  ["browser_language", "Device language"],
  ["timezone", "Timezone"],
  ["page", "Page"],
  ["connection", "Connection"],
  ["online", "Online"],
  ["memory_gb", "Memory (GB)"],
  ["cpu_cores", "CPU cores"],
  ["touch", "Touch screen"],
  ["username", "Username"],
  ["wallet", "Wallet"],
  ["captured_at", "Captured"],
  ["user_agent", "User agent"],
];
const LABELS = new Map(FIELDS);

function show(value: unknown): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function DeviceInfoPanel({ featureId }: { featureId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useFeatureDeviceInfo(featureId, open);

  const rows = data
    ? [
        ...FIELDS.map(([key]) => key).filter((key) => key in data),
        ...Object.keys(data).filter((key) => !LABELS.has(key) && key !== "recent_errors"),
      ]
        .map((key) => [LABELS.get(key) ?? key, show(data[key])] as const)
        .filter(([, value]) => value)
    : [];
  const errors = Array.isArray(data?.recent_errors)
    ? (data!.recent_errors as { at?: string; message?: string }[])
    : [];

  return (
    <View style={styles.box}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <CollapsibleChevron open={open} size={14} color="#A1A1AA" />
        <Text style={styles.title}>{t("features.deviceInfo", "Device info")}</Text>
        <Text style={styles.owners}>{t("features.deviceInfoOwners", "Only board owners see this")}</Text>
      </Pressable>
      <Collapsible open={open}>
        <View style={styles.body}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#A1A1AA" />
          ) : error ? (
            <Text style={styles.error}>{t("features.deviceInfoError", "Couldn't load device info")}</Text>
          ) : !data ? (
            <Text style={styles.note}>{t("features.deviceInfoNone", "No device info for this request")}</Text>
          ) : (
            <>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value} selectable>{value}</Text>
                </View>
              ))}
              <Text style={[styles.label, { marginTop: 8 }]}>{t("features.deviceInfoErrors", "Recent errors")}</Text>
              {errors.length === 0 ? (
                <Text style={styles.value}>{t("features.deviceInfoNoErrors", "None")}</Text>
              ) : (
                errors.map((e, i) => (
                  <Text key={i} style={styles.errorLine} selectable>
                    {e.at ? `${e.at.slice(11, 19)} ` : ""}
                    {e.message}
                  </Text>
                ))
              )}
            </>
          )}
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  title: { color: "#D4D4D8", fontSize: 12, fontWeight: "600" },
  owners: { color: "#71717A", fontSize: 10, marginLeft: "auto" },
  body: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  row: { flexDirection: "row", gap: 10, paddingVertical: 2 },
  label: { color: "#808089", fontSize: 12, width: 104, flexShrink: 0 },
  value: { color: "#E4E4E7", fontSize: 12, flex: 1, minWidth: 0, ...({ wordBreak: "break-all" } as object) },
  note: { color: "#808089", fontSize: 12 },
  error: { color: "#F87171", fontSize: 12 },
  errorLine: { color: "#F59E0B", fontSize: 11, fontFamily: "monospace", marginTop: 2 },
});
