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
import ScreenHeader from "../components/ScreenHeader";
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
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("nav.prompt", "Prompt")} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 64}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 40,
            alignItems: "center",
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-16 h-16 rounded-full bg-white/10 items-center justify-center mb-[18px]">
            <Icon name="Wand" size={30} color="#FFFFFF" />
          </View>
          <Text className="text-white text-[22px] font-bold text-center">
            {t("prompt.title", "What do you want to make?")}
          </Text>
          <Text className="text-theme-neutrals-400 text-sm leading-5 text-center mt-2 mb-[22px]">
            {t("prompt.subtitle", "Ask the DeHub assistant anything — or start from an idea below.")}
          </Text>

          <View className="w-full flex-row items-end gap-2 bg-white/10 border border-white/20 rounded-[20px] px-3.5 py-2.5">
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={t("prompt.placeholder", "Ask anything…")}
              placeholderTextColor="#6F7174"
              className="flex-1 text-white text-base max-h-[140px] p-0"
              multiline
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => submit()}
            />
            <Pressable
              onPress={() => submit()}
              disabled={!text.trim()}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              className={`w-[34px] h-[34px] rounded-full bg-white items-center justify-center ${
                !text.trim() ? "opacity-[0.35]" : ""
              }`}
            >
              <Icon name="ArrowUp" size={18} color="#000000" />
            </Pressable>
          </View>

          <View className="w-full gap-2 mt-[22px]">
            {SUGGESTION_KEYS.map((k) => {
              const label = t(k, SUGGESTION_FALLBACKS[k]);
              return (
                <Pressable
                  key={k}
                  className="flex-row items-center gap-[9px] px-3.5 py-3 rounded-[14px] bg-white/5 border border-white/10"
                  onPress={() => submit(label)}
                >
                  <Icon name="Sparkles" size={13} color="#A1A1AA" />
                  <Text className="text-theme-neutrals-300 text-[13px] leading-[18px] flex-1">
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
