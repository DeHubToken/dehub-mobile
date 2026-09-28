/**
 * BuilderScreen — dehub.io/builder
 *
 * A lander, as on web. Building happens in Messages: @assistant takes the
 * request in the user's DM, builds the app and posts the link back in the same
 * thread, where a reply changes it. So this screen explains the idea and hands
 * whatever is typed here straight to that DM, sent, which keeps every build and
 * every change in the user's messages rather than in a second inbox here.
 *
 * BuilderPreviewScreen stays: that is where the links the bot sends open.
 */
import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import ScreenHeader, { SCREEN_HEADER_HEIGHT } from "../components/ScreenHeader";
import Icon, { type IconName } from "../components/ui/Icon";
import LiquidGlass from "../components/ui/LiquidGlass";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useAuthActions } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { ASSISTANT_ADDRESS, ASSISTANT_USERNAME } from "../libs/assistant";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";

const EXAMPLE_KEYS = ["builder.example1", "builder.example2", "builder.example3"] as const;

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "Sparkles", title: "builder.step1Title", body: "builder.step1Body" },
  { icon: "Wand", title: "builder.step2Title", body: "builder.step2Body" },
  { icon: "Share2", title: "builder.step3Title", body: "builder.step3Body" },
];

export default function BuilderScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset(SCREEN_HEADER_HEIGHT);
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { requireAuth } = useAuthActions();
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<TextInput>(null);

  /** Open the @assistant thread, sending `body` into it when there is one. */
  const openChat = (body?: string) => {
    requireAuth(() => {
      nav.navigate(ScreenNames.Chat, {
        targetAddress: ASSISTANT_ADDRESS,
        title: `@${ASSISTANT_USERNAME}`,
        targetUser: { username: ASSISTANT_USERNAME, address: ASSISTANT_ADDRESS },
        ...(body ? { autoSendText: body } : {}),
      });
      if (body) setPrompt("");
    });
  };

  const send = () => {
    const text = prompt.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    openChat(text);
  };

  const canSend = !!prompt.trim();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("creator.toolBuilder")} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{t("builder.landerTitle")}</Text>
          <Text style={styles.subtitle}>{t("builder.landerSubtitle")}</Text>

          <LiquidGlass className="rounded-3xl" style={{ marginTop: 22 }}>
            <View style={styles.composer}>
              <TextInput
                ref={inputRef}
                value={prompt}
                onChangeText={setPrompt}
                placeholder={t("builder.promptPlaceholder")}
                placeholderTextColor="#7a7a80"
                multiline
                maxLength={2000}
                style={styles.input}
              />
              <Pressable
                onPress={send}
                disabled={!canSend}
                accessibilityRole="button"
                style={({ pressed }) => [styles.send, !canSend && { opacity: 0.35 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.sendText}>{t("builder.sendToAssistant")}</Text>
                <Icon name="ArrowUp" size={18} color="#000" strokeWidth={2.5} />
              </Pressable>
            </View>
          </LiquidGlass>

          <View style={styles.chips}>
            {EXAMPLE_KEYS.map((key) => (
              <Pressable
                key={key}
                onPress={() => {
                  setPrompt(t(key));
                  inputRef.current?.focus();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.chipText}>{t(key)}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ marginTop: 28, gap: 10 }}>
            {STEPS.map((step, i) => (
              <LiquidGlass key={step.title} className="rounded-2xl">
                <View style={styles.step}>
                  <View style={styles.stepIcon}>
                    <Icon name={step.icon} size={16} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>
                      {`${i + 1}. `}
                      {t(step.title)}
                    </Text>
                    <Text style={styles.stepBody}>{t(step.body)}</Text>
                  </View>
                </View>
              </LiquidGlass>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => openChat()}
            style={({ pressed }) => [styles.chatPill, pressed && { opacity: 0.7 }]}
          >
            <Icon name="MessageCircle" size={15} color="#e8e8ea" />
            <Text style={styles.chatPillText}>{t("builder.buildInChat")}</Text>
          </Pressable>

          {/* Staking raises the allowance; the stake screen is a purchase surface, hidden on iOS. */}
          {DIGITAL_PURCHASES_ENABLED && (
            <Pressable
              accessibilityRole="button"
              onPress={() => nav.navigate(ScreenNames.Dpay, { initialTab: "stake" })}
              style={{ alignSelf: "center", marginTop: 14, padding: 4 }}
            >
              <Text style={styles.footnote}>{t("builder.stakeForAllowance")}</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  title: { color: "#fff", fontSize: 30, fontWeight: "800", textAlign: "center", lineHeight: 35 },
  subtitle: { color: "#c9c9ce", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 12, paddingHorizontal: 6 },
  composer: { padding: 14 },
  input: { color: "#fff", fontSize: 17, minHeight: 64, maxHeight: 160, textAlignVertical: "top", paddingVertical: 4 },
  send: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    height: 42,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  sendText: { color: "#000", fontSize: 15, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(20,20,22,0.6)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipText: { color: "#e8e8ea", fontSize: 14 },
  step: { flexDirection: "row", gap: 12, padding: 14 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  stepBody: { color: "#949499", fontSize: 14, lineHeight: 20, marginTop: 3 },
  chatPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(20,20,22,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chatPillText: { color: "#e8e8ea", fontSize: 14, fontWeight: "500" },
  footnote: { color: "#949499", fontSize: 13, textAlign: "center" },
});
