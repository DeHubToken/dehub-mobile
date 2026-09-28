/**
 * ConnectGuideScreen
 * ==================
 * Native port of the web ConnectChatGPTPage (/connect/chatgpt) and
 * ConnectClaudePage (/connect/claude). The two pages are the same layout with
 * a different assistant, so one component serves both routes and reads which
 * assistant from the route name.
 */
import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import LiquidGlass from "../components/ui/LiquidGlass";
import ScreenHeader from "../components/ScreenHeader";
import { openExternalLink } from "../libs/links.utils";
import { ScreenNames } from "../navigation/ScreenNames";
import { AI_APPS } from "../config/connect-ai";

export default function ConnectGuideScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const isClaude = route.name === ScreenNames.ConnectClaude;
  const ai = isClaude ? AI_APPS.claude : AI_APPS.chatgpt;
  const other = isClaude ? AI_APPS.chatgpt : AI_APPS.claude;
  const app = ai.name;

  const steps = [
    { title: t("connect.step1Title", { app }), body: t("connect.step1Body", { app }) },
    { title: t("connect.step2Title"), body: t("connect.step2Body", { app }) },
    { title: t("connect.step3Title"), body: t("connect.step3Body", { app }) },
  ];
  const prompts = [t("connect.prompt1"), t("connect.prompt2"), t("connect.prompt3")];
  const faqs = [
    { q: t("connect.faqFreeQ", { app }), a: t("connect.faqFreeA", { app }) },
    { q: t("connect.faqWhatQ"), a: t("connect.faqWhatA") },
    {
      q: t("connect.faqAccountQ"),
      a: t(isClaude ? "connect.claudeFaqAccount" : "connect.chatgptFaqAccount"),
    },
  ];

  const openButton = (
    <Pressable
      onPress={() => openExternalLink(ai.appUrl)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.openText}>{t("connect.openIn", { app })}</Text>
      <Icon name="ArrowUpRight" size={16} color="#000000" />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("nav.connectAi")} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badge}>
          <Icon name="Plug" size={13} color="#D4D4D8" />
          <Text style={styles.badgeText}>{`DeHub × ${app}`}</Text>
        </View>
        <Text style={styles.title}>{t("connect.guideTitle", { app })}</Text>
        <Text style={styles.subtitle}>{t("connect.guideIntro", { app })}</Text>
        {openButton}

        <Text style={styles.sectionTitle}>{t("connect.setupSteps")}</Text>
        <View style={{ gap: 10 }}>
          {steps.map((s, i) => (
            <LiquidGlass key={i} className="rounded-2xl" style={styles.cardBorder}>
              <View style={styles.stepCard}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardBody}>{s.body}</Text>
                </View>
              </View>
            </LiquidGlass>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t("connect.promptsToTry")}</Text>
        <View style={{ gap: 8 }}>
          {prompts.map((p, i) => (
            <View key={i} style={styles.promptRow}>
              <Icon name="Check" size={15} color="#71717A" />
              <Text selectable style={styles.promptText}>{p}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t("connect.faq")}</Text>
        <View style={{ gap: 10 }}>
          {faqs.map((f, i) => (
            <LiquidGlass key={i} className="rounded-2xl" style={styles.cardBorder}>
              <View style={{ padding: 16 }}>
                <Text style={styles.cardTitle}>{f.q}</Text>
                <Text style={styles.cardBody}>{f.a}</Text>
              </View>
            </LiquidGlass>
          ))}
        </View>

        <View style={{ marginTop: 28, gap: 10 }}>
          {openButton}
          <Pressable
            onPress={() =>
              navigation.navigate(isClaude ? ScreenNames.ConnectChatGPT : ScreenNames.ConnectClaude)
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.otherBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.otherText}>{t("connect.readGuide", { app: other.name })}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  badge: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", letterSpacing: -0.4, marginTop: 14 },
  subtitle: { color: "#A1A1AA", fontSize: 15, lineHeight: 22, marginTop: 8 },
  openBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  openText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  sectionTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", marginTop: 32, marginBottom: 12 },
  cardBorder: { borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  stepCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  stepNumText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  cardBody: { color: "#A1A1AA", fontSize: 14, lineHeight: 20, marginTop: 4 },
  promptRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  promptText: { flex: 1, color: "#D4D4D8", fontSize: 14, lineHeight: 20 },
  otherBtn: {
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  otherText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
