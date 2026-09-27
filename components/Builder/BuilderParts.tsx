/**
 * Pieces shared by the Builder screens: the prompt composer, the glossy build
 * sphere, the status dot and the sandboxed app view.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import LiquidGlass from "../ui/LiquidGlass";
import { openInApp } from "../../libs/links.utils";
import {
  BUSY_STATUSES,
  builderStorageBase,
  loadBuilderAppHtml,
  type BuilderModel,
  type BuilderProject,
} from "../../services/builder.service";

/** Product names, identical in every language (as on web). */
const MODEL_NAMES: Record<BuilderModel, string> = { best: "DeHub Pro", fast: "DeHub Fast" };
const MODEL_KEY = "dehub_builder_model";

export function useBuilderModel(): [BuilderModel, (m: BuilderModel) => void] {
  const [model, setModel] = useState<BuilderModel>("best");
  useEffect(() => {
    AsyncStorage.getItem(MODEL_KEY)
      .then((v) => v === "fast" && setModel("fast"))
      .catch(() => {});
  }, []);
  const set = (m: BuilderModel) => {
    setModel(m);
    AsyncStorage.setItem(MODEL_KEY, m).catch(() => {});
  };
  return [model, set];
}

const SPHERES: Array<[string, string]> = [
  ["#d9f36f", "#78ad18"],
  ["#7ef07a", "#1fae41"],
  ["#72dff8", "#1c8bd8"],
  ["#f87ad2", "#d3189b"],
  ["#8e7bf8", "#4526d8"],
  ["#78f8c8", "#18ae8b"],
  ["#f8b478", "#d86a18"],
];

export function BuildSphere({ id, emoji, size = 44 }: { id: string; emoji: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const [light, dark] = SPHERES[hash % SPHERES.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: dark,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: size * 0.08,
          left: size * 0.12,
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: size,
          backgroundColor: light,
          opacity: 0.85,
        }}
      />
      <Text style={{ fontSize: size * 0.36 }}>{emoji}</Text>
    </View>
  );
}

export function useStatusMeta() {
  const { t } = useTranslation();
  return (p: Pick<BuilderProject, "status">): { label: string; dot: string } => {
    if (BUSY_STATUSES.has(p.status)) return { label: t("builder.working"), dot: "#ffb34d" };
    if (p.status === "error") return { label: t("converter.statusFailed"), dot: "#f56161" };
    return { label: t("feed.live"), dot: "#4ad98c" };
  };
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  sending,
  model,
  onModel,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  sending?: boolean;
  model: BuilderModel;
  onModel: (m: BuilderModel) => void;
  big?: boolean;
}) {
  const { t } = useTranslation();
  const canSend = !disabled && !sending && !!value.trim();
  return (
    <LiquidGlass className="rounded-3xl" style={styles.composer}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#7a7a80"
        editable={!disabled}
        multiline
        style={[styles.input, big && styles.inputBig, disabled && { opacity: 0.5 }]}
      />
      <View style={styles.composerRow}>
        <View style={styles.modelToggle} accessibilityRole="radiogroup" accessibilityLabel={t("builder.chooseModel")}>
          {(Object.keys(MODEL_NAMES) as BuilderModel[]).map((key) => {
            const active = key === model;
            return (
              <Pressable
                key={key}
                onPress={() => onModel(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityHint={key === "best" ? t("builder.modelProDesc") : t("builder.modelFastDesc")}
                style={[styles.modelPill, active && styles.modelPillActive]}
              >
                <Text style={[styles.modelText, active && styles.modelTextActive]}>{MODEL_NAMES[key]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t("builder.send")}
          style={[styles.send, !canSend && { opacity: 0.35 }]}
        >
          {sending ? <ActivityIndicator color="#000" /> : <Icon name="ArrowUp" size={20} color="#000" strokeWidth={2.5} />}
        </Pressable>
      </View>
      <Text style={styles.modelHint}>{model === "best" ? t("builder.modelProDesc") : t("builder.modelFastDesc")}</Text>
    </LiquidGlass>
  );
}

/**
 * Renders a generated app. The HTML is untrusted, AI-written code: no bridge
 * (no onMessage / injected JS), no popups, and any navigation away from the
 * app's own Storage folder opens in the browser instead of inside this view.
 */
export function BuilderAppView({ projectId, version, nonce }: { projectId: string; version?: number; nonce: number }) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const base = builderStorageBase(projectId);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    loadBuilderAppHtml(projectId, version)
      .then((h) => !cancelled && setHtml(h))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [projectId, version, nonce]);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{t("builder.notAvailable")}</Text>
      </View>
    );
  }
  if (!html) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3f7aff" />
        <Text style={[styles.dim, { marginTop: 10 }]}>{t("builder.gettingReady")}</Text>
      </View>
    );
  }
  return (
    <WebView
      key={`${projectId}-${nonce}`}
      source={{ html, baseUrl: base }}
      originWhitelist={["*"]}
      style={{ flex: 1, backgroundColor: "#fff" }}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowFileAccess={false}
      onShouldStartLoadWithRequest={(req) => {
        const url = req.url || "";
        if (!/^https?:/i.test(url) || url.startsWith(base) || req.isTopFrame === false) return true;
        void openInApp(url);
        return false;
      }}
    />
  );
}

const styles = StyleSheet.create({
  composer: { padding: 14 },
  input: { color: "#fff", fontSize: 16, minHeight: 24, maxHeight: 140, textAlignVertical: "top", paddingVertical: 4 },
  inputBig: { fontSize: 17, minHeight: 64 },
  composerRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 10 },
  modelToggle: { flex: 1, flexDirection: "row", gap: 6 },
  modelPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)" },
  modelPillActive: { backgroundColor: "rgba(255,255,255,0.16)" },
  modelText: { color: "#949499", fontSize: 13, fontWeight: "600" },
  modelTextActive: { color: "#fff" },
  modelHint: { color: "#7a7a80", fontSize: 12, marginTop: 8 },
  send: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  dim: { color: "#949499", fontSize: 14, textAlign: "center" },
});
