/**
 * ConnectScreen
 * =============
 * Native port of the web ConnectPage (/connect): the public MCP server URL
 * with a copy button, and the manual steps for adding it to ChatGPT and
 * Claude. The one-tap guides for each assistant live in ConnectGuideScreen.
 */
import React, { useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import Icon from "../components/ui/Icon";
import LiquidGlass from "../components/ui/LiquidGlass";
import ScreenHeader from "../components/ScreenHeader";
import { SettingsSection, SettingsLinkRow, Divider } from "../components/Settings/SettingsPrimitives";
import { toastError, toastSuccess } from "../libs";
import { openExternalLink } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import { AI_APPS, MCP_URL } from "../config/connect-ai";

function Steps({ items }: { items: string[] }) {
  return (
    <View style={styles.steps}>
      {items.map((text, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={styles.stepNum}>{i + 1}.</Text>
          <Text style={styles.stepText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ConnectScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const chatgpt = AI_APPS.chatgpt;
  const claude = AI_APPS.claude;

  const copyUrl = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(MCP_URL);
      toastSuccess(t("connect.urlCopied"));
    } catch {
      toastError(t("toasts.failed_to_copy"));
    }
  }, [t]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("nav.connectAi")} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.title}>{t("connect.title")}</Text>
          <Text style={styles.subtitle}>{t("connect.subtitle")}</Text>
        </View>

        <LiquidGlass className="rounded-2xl" style={styles.urlCard}>
          <View style={styles.urlInner}>
            <Text style={styles.urlLabel}>{t("connect.serverUrl")}</Text>
            <Text selectable style={styles.urlText}>{MCP_URL}</Text>
            <Pressable
              onPress={copyUrl}
              accessibilityRole="button"
              accessibilityLabel={t("common.copy")}
              style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.8 }]}
            >
              <Icon name="Copy" size={15} color="#000000" />
              <Text style={styles.copyText}>{t("common.copy")}</Text>
            </Pressable>
          </View>
        </LiquidGlass>

        <View style={styles.agentCard}>
          <Text style={styles.agentTitle}>{t("connect.agentTitle")}</Text>
          <Text style={styles.agentBody}>{t("connect.agentBody")}</Text>
          <Pressable
            onPress={() => navigation.navigate(ScreenNames.Agents)}
            accessibilityRole="link"
            style={styles.agentLink}
          >
            <Text style={styles.agentLinkText}>{t("agents.createAgent")}</Text>
            <Icon name="ChevronRight" size={14} color="#FFFFFF" />
          </Pressable>
        </View>

        <SettingsSection label={chatgpt.name}>
          <Steps
            items={[
              t("connect.chatgptDevMode"),
              t("connect.chatgptComposer"),
              t("connect.chatgptAddSources"),
              t("connect.nameAndPaste"),
              t("connect.askToUse", { app: chatgpt.name }),
            ]}
          />
          <Divider />
          <SettingsLinkRow
            icon="Settings"
            label={t("connect.openSettings", { app: chatgpt.name })}
            onPress={() => openExternalLink(chatgpt.settingsUrl)}
            external
          />
          <Divider />
          <SettingsLinkRow
            icon="BookOpen"
            label={t("connect.readGuide", { app: chatgpt.name })}
            onPress={() => navigation.navigate(ScreenNames.ConnectChatGPT)}
          />
        </SettingsSection>

        <SettingsSection label={claude.name}>
          <Steps
            items={[
              t("connect.openSettings", { app: claude.name }),
              t("connect.nameAndPaste"),
              t("connect.claudeEnable"),
            ]}
          />
          <Divider />
          <SettingsLinkRow
            icon="Settings"
            label={t("connect.openSettings", { app: claude.name })}
            onPress={() => openExternalLink(claude.settingsUrl)}
            external
          />
          <Divider />
          <SettingsLinkRow
            icon="BookOpen"
            label={t("connect.readGuide", { app: claude.name })}
            onPress={() => navigation.navigate(ScreenNames.ConnectClaude)}
          />
        </SettingsSection>

        <Text style={styles.footer}>{t("connect.otherClients")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  intro: { paddingHorizontal: 16, paddingTop: 8 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { color: "#A1A1AA", fontSize: 15, lineHeight: 22, marginTop: 8 },
  urlCard: { marginHorizontal: 16, marginTop: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  urlInner: { padding: 16 },
  urlLabel: { color: "#71717A", fontSize: 11, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase" },
  urlText: { color: "#FFFFFF", fontSize: 13, fontFamily: "monospace", marginTop: 8, lineHeight: 19 },
  copyBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  copyText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  agentCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  agentTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  agentBody: { color: "#A1A1AA", fontSize: 13, lineHeight: 19, marginTop: 6 },
  agentLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, alignSelf: "flex-start" },
  agentLinkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  steps: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  stepRow: { flexDirection: "row", gap: 8 },
  stepNum: { color: "#71717A", fontSize: 14, fontWeight: "700", minWidth: 18 },
  stepText: { flex: 1, color: "#D4D4D8", fontSize: 14, lineHeight: 20 },
  footer: { color: "#71717A", fontSize: 13, lineHeight: 19, marginHorizontal: 20, marginTop: 20 },
});
