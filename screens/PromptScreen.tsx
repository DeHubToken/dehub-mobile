/**
 * PromptScreen
 * ============
 * Native port of web's feed-prompting flow. On web this is two pieces:
 * `pages/PromptLanding.tsx` (the "What do you want to see?" landing) which
 * redirects to `/app?prompt=…`, and `components/app/feeds/PromptFlowModal.tsx`
 * which then runs input → analysing → tune and writes the resulting categories
 * back onto the home feed.
 *
 * Mobile has no equivalent of a URL query param handoff, so both halves live
 * here: the landing collects the prompt, the same three stages run in place,
 * and Save applies the result to HomeScreen via `promptFeedEvents`.
 *
 * One real difference from web: web's home feed holds `selectedCategories`
 * (an array), so it saves every category with weight > 0. Mobile's feed holds a
 * single `selectedCategory` string, so Save applies the highest-weighted one.
 * The sliders still tune the mix — they decide which category wins.
 *
 * Voice input: web uses the browser SpeechRecognition API, which React Native
 * has no equivalent for, so the landing here has no mic button.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Easing,
  Animated as RNAnimated,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import { ScreenNames } from "../navigation/ScreenNames";
import { getCategoriesCached } from "../services/nft.service";
import { scorePromptAgainstCategories, CategoryWeight } from "../libs/promptFeed";
import { promptFeedEvents } from "../libs/eventBus";
import { storage } from "../libs/storage";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";

/** 8pt + 32pt back button + 8pt — see styles.header / styles.backBtn. */
const PROMPT_HEADER_HEIGHT = 48;

type Stage = "input" | "analysing" | "tune";

/** Same nine orbit icons as web's ORBIT_ICONS, in the same order. */
const ORBIT_ICONS: IconName[] = [
  "Sparkles",
  "Cpu",
  "Atom",
  "Gamepad2",
  "Trophy",
  "Music2",
  "Film",
  "Image",
  "Radio",
];

/** Same five suggestion slots as web's SUGGESTION_KEYS. */
const SUGGESTION_KEYS = [
  "prompt.suggestion1",
  "prompt.suggestion2",
  "prompt.suggestion3",
  "prompt.suggestion4",
  "prompt.suggestion5",
] as const;

const SUGGESTION_FALLBACKS: Record<string, string> = {
  "prompt.suggestion1": "More AI and crypto news",
  "prompt.suggestion2": "Gaming clips and esports",
  "prompt.suggestion3": "Indie music discoveries",
  "prompt.suggestion4": "Tech founders and startups",
  "prompt.suggestion5": "Football highlights",
};

/** Web fakes the analysis with a 1400ms timer; matched here. */
const ANALYSE_MS = 1400;
const ORBIT_RADIUS = 72;

function AnalysingOrbit() {
  const spin = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.timing(spin, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const counterRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] });

  return (
    <View style={styles.orbitWrap}>
      <View style={styles.orbitRing} />
      <RNAnimated.View style={[styles.orbitLayer, { transform: [{ rotate }] }]}>
        {ORBIT_ICONS.slice(0, 6).map((name, i) => {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(angle) * ORBIT_RADIUS;
          const y = Math.sin(angle) * ORBIT_RADIUS;
          return (
            <RNAnimated.View
              key={name}
              style={[
                styles.orbitNode,
                { transform: [{ translateX: x }, { translateY: y }, { rotate: counterRotate }] },
              ]}
            >
              <Icon name={name} size={16} color="#FFFFFF" />
            </RNAnimated.View>
          );
        })}
      </RNAnimated.View>
      <View style={styles.orbitCore}>
        <Icon name="Sparkles" size={24} color="#FFFFFF" />
      </View>
    </View>
  );
}

export default function PromptScreen() {
  // This screen draws its own header rather than a ScreenHeader: a 32pt back
  // button over 8pt of bottom padding.
  const keyboardOffset = useKeyboardOffset(PROMPT_HEADER_HEIGHT);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [weights, setWeights] = useState<CategoryWeight[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Keep latest categories in a ref so the deferred timer always scores against
  // fresh data — same guard web uses via `categoriesRef`.
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getCategoriesCached();
        if (mounted && Array.isArray(list)) {
          setCategories(list.filter((c) => typeof c === "string" && c.trim().length > 0));
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  // If we reached `tune` before categories arrived (race), recompute on arrival.
  useEffect(() => {
    if (stage === "tune" && weights.length === 0 && categories.length > 0 && text.trim()) {
      setWeights(scorePromptAgainstCategories(text, categories));
    }
  }, [stage, weights.length, categories, text]);

  const submit = useCallback(
    (value?: string) => {
      const v = (value ?? text).trim();
      if (!v) return;
      setText(v);
      setStage("analysing");
      setTimeout(() => {
        setWeights(scorePromptAgainstCategories(v, categoriesRef.current));
        setStage("tune");
      }, ANALYSE_MS);
    },
    [text],
  );

  const handleWeightChange = useCallback((id: string, weight: number) => {
    setWeights((prev) => prev.map((w) => (w.id === id ? { ...w, weight: Math.round(weight) } : w)));
  }, []);

  const topCategory = useMemo(() => {
    const positive = weights.filter((w) => w.weight > 0);
    if (positive.length === 0) return undefined;
    return positive.reduce((best, w) => (w.weight > best.weight ? w : best)).name;
  }, [weights]);

  const handleSave = useCallback(() => {
    // Persist so a cold start keeps the tuned feed, and emit so the already
    // mounted HomeScreen picks it up now.
    try { storage.set("dehub:defaultCategory", topCategory ?? ""); } catch {}
    promptFeedEvents.chooseCategory(topCategory);
    navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Home });
  }, [topCategory, navigation]);

  return (
    // No insets.top here. This screen lives inside the navigator, and the
    // navigator is already wrapped in a full-edge <SafeAreaView> in App.tsx's
    // BootGate, so adding the device inset again counted the notch twice and
    // left a dead band above the header — the same trap AppDrawer hit.
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (stage === "input" ? navigation.goBack() : setStage("input"))}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Icon name="ArrowLeft" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("nav.prompt", "Prompt")}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? keyboardOffset : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stage === "input" && (
            <>
              <View style={styles.wandWrap}>
                <Icon name="Wand" size={30} color="#FFFFFF" />
              </View>
              <Text style={styles.title}>{t("prompt.headline", "What do you want to see?")}</Text>
              <Text style={styles.subtitle}>
                {t("prompt.subheadline", "Describe your perfect feed.")}
              </Text>

              <View style={styles.composer}>
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={setText}
                  placeholder={t("prompt.placeholder", "More AI, gaming clips, indie music…")}
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

              <Pressable
                style={styles.skip}
                onPress={() => navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Home })}
              >
                <Text style={styles.skipText}>
                  {t("prompt.skip", "Skip — just take me to the feed")}
                </Text>
              </Pressable>
            </>
          )}

          {stage === "analysing" && (
            <View style={styles.analysing}>
              <AnalysingOrbit />
              <Text style={styles.analysingText}>
                {t("prompt.analysing", "Analysing your interests…")}
              </Text>
            </View>
          )}

          {stage === "tune" && (
            <View style={styles.tune}>
              <Text style={styles.title}>{t("prompt.timelineReady", "Your timeline is ready")}</Text>
              <Text style={styles.subtitle}>
                {t("prompt.dragToTune", "Drag to fine-tune your mix.")}
              </Text>

              {weights.length === 0 ? (
                <ActivityIndicator color="#FFFFFF" style={{ marginTop: 24 }} />
              ) : (
                <View style={styles.sliders}>
                  {weights.map((w, idx) => (
                    <View key={w.id} style={styles.sliderRow}>
                      <View style={styles.sliderIcon}>
                        <Icon name={ORBIT_ICONS[idx % ORBIT_ICONS.length]} size={16} color="#FFFFFF" />
                      </View>
                      <Text style={styles.sliderLabel} numberOfLines={1}>
                        {w.name}
                      </Text>
                      <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={100}
                        step={1}
                        value={w.weight}
                        onValueChange={(v) => handleWeightChange(w.id, v)}
                        minimumTrackTintColor="#FFFFFF"
                        maximumTrackTintColor="rgba(255,255,255,0.15)"
                        thumbTintColor="#FFFFFF"
                      />
                      <Text style={styles.sliderValue}>{w.weight}%</Text>
                    </View>
                  ))}
                </View>
              )}

              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Icon name="Check" size={17} color="#000000" />
                <Text style={styles.saveText}>{t("prompt.save", "Save")}</Text>
              </Pressable>
            </View>
          )}
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
    // Symmetric padding now that the root no longer double-counts the notch —
    // without a top pad the back button sat flush against the status bar.
    paddingTop: 8,
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
  skip: { marginTop: 24, paddingVertical: 8 },
  skipText: { color: "rgba(255,255,255,0.4)", fontSize: 12 },

  analysing: { alignItems: "center", paddingTop: 40, gap: 24 },
  orbitWrap: { width: 176, height: 176, alignItems: "center", justifyContent: "center" },
  orbitRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  orbitLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  orbitNode: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  orbitCore: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  analysingText: { color: "rgba(255,255,255,0.6)", fontSize: 13.5 },

  tune: { width: "100%", alignItems: "center" },
  sliders: { width: "100%", gap: 14, marginTop: 4 },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sliderIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  sliderLabel: { color: "#FFFFFF", fontSize: 13, width: 76 },
  slider: { flex: 1, height: 32 },
  sliderValue: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11.5,
    width: 38,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  saveBtn: {
    marginTop: 26,
    width: "100%",
    height: 48,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveText: { color: "#000000", fontSize: 15, fontWeight: "700" },
});
