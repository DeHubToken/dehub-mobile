import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
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
import React, { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import LiquidGlass from "../components/ui/LiquidGlass";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { useAuthActions, useAuthState } from "../context/AuthContext";
import BuilderModelCard from "../components/Builder/BuilderModelCard";
import { ASSISTANT_ADDRESS, ASSISTANT_USERNAME } from "../libs/assistant";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { builderApi } from "../services/builder.service";
import { fetchBuilderShowcase } from "../services/miniapps.service";

const EXAMPLE_KEYS = ["builder.example1", "builder.example2", "builder.example3"] as const;

/**
 * The speed dial under the prompt. Each stop is one model from the builder's
 * menu; the price beside it is the live per-prompt quote once signed in.
 */
const TIERS = [
  { key: "builder.tierFast", model: "anthropic/claude-haiku-5.5" },
  { key: "builder.tierBalanced", model: "anthropic/claude-sonnet-5.5" },
  { key: "builder.tierBest", model: "anthropic/claude-opus-5.5" },
] as const;

const usd = (value: number) =>
  value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 0.1 ? 3 : 2,
  });

export default function BuilderScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const nav = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { requireAuth } = useAuthActions();
  const [prompt, setPrompt] = useSurfaceDraft("screens/BuilderScreen.tsx:prompt", "");
  const inputRef = useRef<TextInput>(null);
  const { isSignedIn } = useAuthState();
  const queryClient = useQueryClient();
  const [tier, setTier] = useSurfaceDraft<string>("screens/BuilderScreen.tsx:tier", "anthropic/claude-sonnet-5.5");
  const { data: pricing } = useQuery({
    queryKey: ["builder-pricing"],
    queryFn: () => builderApi.pricing(),
    enabled: isSignedIn,
    staleTime: 60_000,
    retry: false,
  });
  const { data: showcase } = useQuery({ queryKey: ["builder-showcase"], queryFn: fetchBuilderShowcase, staleTime: 300_000 });

  // A saved model that is one of the dial's stops lights that stop.
  useEffect(() => {
    if (pricing && TIERS.some((x) => x.model === pricing.model)) setTier(pricing.model);
  }, [pricing?.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = pricing?.models?.find((m) => m.id === tier);

  /** Open the @assistant thread, sending `body` into it when there is one. */
  const openChat = (body?: string) => {
    requireAuth(async () => {
      // The prompt is built with whatever the dial says, so save it first.
      if (body && pricing && pricing.model !== tier) {
        await builderApi.setModel(tier).catch(() => undefined);
        queryClient.invalidateQueries({ queryKey: ["builder-pricing"] });
      }
      nav.navigate(ScreenNames.Chat, {
        targetAddress: ASSISTANT_ADDRESS,
        title: `@${ASSISTANT_USERNAME}`,
        targetUser: { username: ASSISTANT_USERNAME, address: ASSISTANT_ADDRESS },
        ...(body ? { autoSendText: body } : {}),
      });
      if (body) setPrompt.complete(prompt, "");
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
    <View className="bg-theme-background" style={styles.screen}>
      <ScreenHeader title={t("creator.toolBuilder")} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.liveChipRow}>
            <Text style={styles.liveChip}>{t("builder.liveChip")}</Text>
          </View>
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
              <View style={styles.dialRow}>
                <View accessibilityRole="radiogroup" accessibilityLabel={t("builder.modelLabel")} style={styles.dial}>
                  {TIERS.map(({ key, model }) => {
                    const on = tier === model;
                    return (
                      <Pressable
                        key={model}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        onPress={() => setTier(model)}
                        style={[styles.dialStop, on && styles.dialStopOn]}
                      >
                        <Text style={[styles.dialText, on && styles.dialTextOn]}>{t(key)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {active && (
                <Text style={styles.quote}>
                  {active.label} · {t("builder.perPrompt", { price: usd(active.typicalMicros / 1_000_000) })}
                </Text>
              )}
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

          {!!showcase?.length && (
            <View style={{ marginTop: 32 }}>
              <View style={styles.showcaseHeader}>
                <Text style={styles.showcaseTitle}>{t("builder.builtThisWeek")}</Text>
                <Pressable accessibilityRole="link" onPress={() => nav.navigate(ScreenNames.Apps)} hitSlop={8}>
                  <Text style={styles.seeAll}>{t("builder.seeAllApps")}</Text>
                </Pressable>
              </View>
              <View style={styles.grid}>
                {showcase.map((app) => (
                  <Pressable
                    key={app.slug}
                    accessibilityRole="button"
                    onPress={() => nav.navigate(ScreenNames.MiniApp, { slug: app.slug, from: "store" })}
                    style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
                  >
                    <LiquidGlass className="rounded-2xl">
                      <View style={[styles.tileArt, { backgroundColor: app.splash_background_color ?? "#3b2a8a" }]}>
                        {app.icon_url ? <Image source={{ uri: app.icon_url }} style={styles.tileIcon} /> : null}
                      </View>
                      <View style={{ padding: 10 }}>
                        <Text style={styles.tileName} numberOfLines={1}>{app.name}</Text>
                        <Text style={styles.tileDomain} numberOfLines={1}>{app.domain}</Text>
                      </View>
                    </LiquidGlass>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <BuilderModelCard />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  liveChipRow: { alignItems: "center", marginBottom: 16 },
  liveChip: {
    color: "#c7b8ff",
    fontSize: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(10,10,12,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  dialRow: { flexDirection: "row", marginTop: 10 },
  dial: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 3,
  },
  dialStop: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  dialStopOn: { backgroundColor: "#7c5cff" },
  dialText: { color: "#949499", fontSize: 13, fontWeight: "500" },
  dialTextOn: { color: "#fff" },
  quote: { color: "#949499", fontSize: 12, marginTop: 6, fontVariant: ["tabular-nums"] },
  showcaseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  showcaseTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  seeAll: { color: "#949499", fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  tile: { width: "48.5%" },
  tileArt: { aspectRatio: 16 / 10, alignItems: "center", justifyContent: "center", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  tileIcon: { width: 48, height: 48, borderRadius: 14 },
  tileName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  tileDomain: { color: "#949499", fontSize: 12, marginTop: 2 },
});
