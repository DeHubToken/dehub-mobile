/**
 * PromptScreen
 * ============
 * Native port of web's PromptLanding (/prompt): a focused entry point that
 * takes a question and hands it to the assistant.
 *
 * Web navigates to /app?prompt=… ; here it navigates to the AIChat tab with an
 * `initialPrompt` param, which seeds the composer rather than auto-sending —
 * matching web, where the assistant receives the text but the user still
 * confirms it.
 *
 * Voice input: web uses the browser SpeechRecognition API, which React Native
 * has no equivalent for. The assistant screen already owns audio/attachment
 * handling, so the mic lives there rather than being stubbed here.
 */
import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import { useAuthState } from "../context/AuthContext";
import { ScreenNames } from "../navigation/ScreenNames";

/** Same five suggestion slots as web's SUGGESTION_KEYS. */
const SUGGESTION_KEYS = [
  "prompt.suggestion1",
  "prompt.suggestion2",
  "prompt.suggestion3",
  "prompt.suggestion4",
  "prompt.suggestion5",
] as const;

const SUGGESTION_FALLBACKS: Record<string, string> = {
  "prompt.suggestion1": "Summarise what's trending on DeHub today",
  "prompt.suggestion2": "Draft a post about my latest upload",
  "prompt.suggestion3": "Explain DHB staking in simple terms",
  "prompt.suggestion4": "Find creators I should follow",
  "prompt.suggestion5": "Write a bounty brief for a clipping campaign",
};

export default function PromptScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const submit = useCallback(
    (value?: string) => {
      const v = (value ?? text).trim();
      if (!v) return;
      if (!isAuthed) {
        navigation.navigate(ScreenNames.SignIn);
        return;
      }
      // AIChat lives in the bottom-tab navigator, so it has to be reached
      // through Root rather than directly from the stack.
      navigation.navigate(ScreenNames.Root, {
        screen: ScreenNames.AIChat,
        params: { initialPrompt: v },
      });
      setText("");
    },
    [text, isAuthed, navigation],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("nav.prompt", "Prompt")}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.wandWrap}>
            <Icon name="Wand" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{t("prompt.title", "What do you want to make?")}</Text>
          <Text style={styles.subtitle}>
            {t("prompt.subtitle", "Ask the DeHub assistant anything — or start from an idea below.")}
          </Text>

          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={t("prompt.placeholder", "Ask anything…")}
              placeholderTextColor="#52525B"
              style={styles.input}
              multiline
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => submit()}
            />
            <Pressable
              onPress={() => submit()}
              disabled={!text.trim()}
              style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            >
              <Icon name="ArrowUp" size={18} color="#000000" />
            </Pressable>
          </View>

          <View style={styles.suggestions}>
            {SUGGESTION_KEYS.map((k) => {
              const label = t(k, SUGGESTION_FALLBACKS[k]);
              return (
                <Pressable key={k} style={styles.suggestion} onPress={() => submit(label)}>
                  <Icon name="Sparkles" size={13} color="#A1A1AA" />
                  <Text style={styles.suggestionText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },

  body: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40, alignItems: "center" },
  wandWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", textAlign: "center" },
  subtitle: {
    color: "#A1A1AA",
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 22,
  },

  composer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: { flex: 1, color: "#FFFFFF", fontSize: 15, maxHeight: 140, padding: 0 },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.35 },

  suggestions: { width: "100%", gap: 8, marginTop: 22 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  suggestionText: { color: "#D4D4D8", fontSize: 13, flex: 1, lineHeight: 18 },
});
