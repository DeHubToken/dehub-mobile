/**
 * The sandboxed view a generated Builder app renders in — used by the
 * /builder/preview/:id screen, which is where the links @assistant sends land.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useTranslation } from "react-i18next";
import { openInApp } from "../../libs/links.utils";
import { builderStorageBase, loadBuilderAppHtml } from "../../services/builder.service";

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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  dim: { color: "#949499", fontSize: 14, textAlign: "center" },
});
