/**
 * Quick Send: shown when the menu search or the settings search finds nothing.
 *
 * Mirrors web's src/components/app/navigation/SearchRequestPrompt.tsx. The box
 * is already filled with what was typed ("Add karaoke to Riftn"); one tap of
 * the arrow sends it to the Requests board as the person's own request. They
 * can edit it first; signed out, the tap opens sign in.
 *
 * The send button's fill sits on an inner View: libs/jsx/controls.js repaints
 * neutral Pressable fills with the control material, which would hide the
 * arrow on a white button. Colours are written for dark only: System Light's
 * pass (libs/jsx/tone.js) turns the greys around, so the white key becomes ink.
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useTranslation } from "react-i18next";

import Icon from "../ui/Icon";
import { ThemeIcon } from "../page/PageKit";
import { useAppTheme } from "../../context/ThemeContext";
import { useAuthActions } from "../../context/AuthContext";
import { useSubmitFeatureRequest } from "../../hooks/useFeatureRequests";
import { SEARCH_INPUT_CLEAR } from "../../hooks/useSearchFieldMaterial";
import { searchRequestDraft, searchRequestFields, type SearchRequestSource } from "../../libs/searchRequest";

interface Props {
  query: string;
  source: SearchRequestSource;
  /** Opens the Requests board after a send ("See it on Requests"). */
  onOpenRequests?: () => void;
}

export default function SearchRequestPrompt({ query, source, onOpenRequests }: Props) {
  const { t } = useTranslation();
  const { skin } = useAppTheme() as any;
  const { requireAuth } = useAuthActions();
  const submit = useSubmitFeatureRequest();
  const draft = searchRequestDraft(query, source, (key, fallback, options) => t(key, { defaultValue: fallback, ...options }) as string);
  const [text, setText] = useState(draft);
  const [sent, setSent] = useState(false);
  const edited = useRef(false);

  useEffect(() => {
    setSent(false);
    if (!edited.current) setText(draft);
  }, [draft]);

  const send = () => {
    const body = text.trim();
    if (!body || submit.isPending || sent) return;
    requireAuth(() => {
      submit.mutate(
        { ...searchRequestFields(body, query, source), category: "new_feature", screen: source === "settings" ? "SettingsSearch" : "MenuSearch" },
        { onSuccess: () => { setSent(true); edited.current = false; } },
      );
    });
  };

  const card = [{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.05)", padding: 12 }, skin?.material === "glass" ? skin.card : null];

  if (sent) {
    return (
      <View style={card} accessibilityLiveRegion="polite">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Icon name="Check" size={16} color="#34D399" strokeWidth={2.4} />
          <Text className="text-white text-[13px] font-semibold">{t("sidebar.requestSent", { defaultValue: "Sent to Requests" })}</Text>
        </View>
        <Text className="text-theme-neutrals-500 text-xs mt-1">{t("sidebar.requestSentHint", { defaultValue: "We will tell you when it ships." })}</Text>
        {onOpenRequests ? (
          <Pressable accessibilityRole="link" onPress={onOpenRequests} hitSlop={8} style={{ marginTop: 8, alignSelf: "flex-start" }}>
            <Text className="text-theme-neutrals-300 text-xs font-semibold underline">{t("sidebar.requestSeeIt", { defaultValue: "See it on Requests" })}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const disabled = !text.trim() || submit.isPending;
  return (
    <View style={card}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <ThemeIcon icon="features" size={20} />
        <Text className="text-theme-neutrals-400 text-[13px] flex-1">{t("sidebar.requestPrompt", { defaultValue: "Not here yet? Send it as a request" })}</Text>
      </View>
      <View
        className="flex-row items-center"
        style={{ marginTop: 8, gap: 8, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(9,9,11,0.35)", paddingLeft: 12, paddingRight: 4, paddingVertical: 4 }}
      >
        <TextInput
          value={text}
          maxLength={100}
          onChangeText={(value) => { edited.current = true; setText(value); }}
          onSubmitEditing={send}
          returnKeyType="send"
          accessibilityLabel={t("sidebar.requestPrompt", { defaultValue: "Not here yet? Send it as a request" })}
          className="flex-1 text-white text-sm py-1"
          style={SEARCH_INPUT_CLEAR}
          placeholderTextColor="#8B8D90"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sidebar.requestSend", { defaultValue: "Send request" })}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={send}
          hitSlop={6}
        >
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
            <Icon name="ArrowUp" size={16} color="#0B0B0F" strokeWidth={2.6} />
          </View>
        </Pressable>
      </View>
      <Text className="text-theme-neutrals-500 text-xs mt-2">{t("sidebar.requestHint", { defaultValue: "Posts to Requests as you. We will tell you when it ships." })}</Text>
    </View>
  );
}
