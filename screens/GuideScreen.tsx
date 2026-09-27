/**
 * GuideScreen
 * ===========
 * Native port of the web GuidePage (/guide). A step-by-step walkthrough of every
 * feature, as expandable sections with search. Pure static content — no API.
 * Content and wording mirror the web app.
 */
import React, { useMemo, useState, useCallback } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, LayoutAnimation, Platform, UIManager } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Icon, { type IconName } from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Copy is shared with the web /guide page and lives under guide.sections.<id>
 * in the locale files; steps and tips are numbered from 1, so the counts here
 * must match en.json. "trading-fractions" is mobile-only: the app sends fraction
 * trading to the web marketplace, so it replaces web's buy/sell sections.
 */
interface GuideSectionDef {
  id: string;
  icon: IconName;
  steps: number;
  tips?: number;
}

interface GuideSection {
  id: string;
  title: string;
  icon: IconName;
  intro: string;
  steps: string[];
  tips?: string[];
}

const SECTION_DEFS: GuideSectionDef[] = [
  { id: "getting-started", icon: "LogIn", steps: 6, tips: 3 },
  { id: "home-feed", icon: "House", steps: 7, tips: 3 },
  { id: "creating-posts", icon: "SquarePen", steps: 9, tips: 3 },
  { id: "interacting-with-posts", icon: "ThumbsUp", steps: 8, tips: 3 },
  { id: "explore-search", icon: "Search", steps: 6, tips: 2 },
  { id: "profile", icon: "User", steps: 7, tips: 2 },
  { id: "messages", icon: "MessageCircle", steps: 6, tips: 2 },
  { id: "ai-assistant", icon: "Bot", steps: 6, tips: 3 },
  { id: "notifications", icon: "Bell", steps: 5, tips: 2 },
  { id: "wallet", icon: "Wallet", steps: 6, tips: 2 },
  { id: "staking", icon: "Landmark", steps: 6, tips: 3 },
  { id: "leaderboard", icon: "Trophy", steps: 7, tips: 2 },
  { id: "command-centre", icon: "LayoutDashboard", steps: 4, tips: 1 },
  { id: "governance", icon: "Vote", steps: 6, tips: 3 },
  { id: "bookmarks", icon: "Bookmark", steps: 4, tips: 2 },
  { id: "settings", icon: "Settings", steps: 5, tips: 2 },
  { id: "posting-allowance", icon: "SquarePen", steps: 6, tips: 4 },
  { id: "reactions-and-safety", icon: "ThumbsUp", steps: 6, tips: 3 },
  { id: "stages", icon: "MessageCircle", steps: 6, tips: 4 },
  { id: "communities", icon: "Landmark", steps: 5, tips: 2 },
  { id: "arcade", icon: "Trophy", steps: 4, tips: 2 },
  { id: "bounties-stores", icon: "ShoppingCart", steps: 5, tips: 3 },
  { id: "creator-studio", icon: "SquarePen", steps: 5, tips: 3 },
  { id: "buying-dhb", icon: "ShoppingCart", steps: 7, tips: 3 },
  { id: "bridge", icon: "ArrowLeftRight", steps: 7, tips: 3 },
  { id: "music-tv", icon: "Music", steps: 6, tips: 2 },
  { id: "post-info", icon: "BookOpen", steps: 6, tips: 3 },
  { id: "trading-fractions", icon: "ShoppingCart", steps: 4, tips: 3 },
  { id: "minting-posts", icon: "SquarePen", steps: 6, tips: 4 },
  { id: "glossary", icon: "BookOpen", steps: 4, tips: 2 },
];

const numbered = (n = 0) => Array.from({ length: n }, (_, i) => i + 1);

function buildSections(t: TFunction): GuideSection[] {
  return SECTION_DEFS.map((d) => {
    const base = `guide.sections.${d.id}`;
    return {
      id: d.id,
      icon: d.icon,
      title: t(`${base}.title`),
      intro: t(`${base}.intro`),
      steps: numbered(d.steps).map((i) => t(`${base}.steps.${i}`)),
      tips: d.tips ? numbered(d.tips).map((i) => t(`${base}.tips.${i}`)) : undefined,
    };
  });
}

function sectionMatches(section: GuideSection, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = [section.title, section.intro, ...section.steps, ...(section.tips || [])]
    .join(" ")
    .toLowerCase();
  return tokens.every((tok) => haystack.includes(tok));
}

export default function GuideScreen() {
  const { t, i18n } = useTranslation();
  const sections = useMemo(() => buildSections(t), [t, i18n.language]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([SECTION_DEFS[0].id]));

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const filtered = useMemo(() => sections.filter((s) => sectionMatches(s, tokens)), [sections, tokens]);

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("nav.guide")} subtitle={t("screens.guideSubtitle")} />

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="Search" size={16} color="#808089" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("screens.searchGuide")}
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 24, paddingTop: 8, gap: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.length > 0 ? (
          filtered.map((section) => {
            const isOpen = expanded.has(section.id) || tokens.length > 0;
            return (
              <View key={section.id} style={styles.section}>
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => toggle(section.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                >
                  <View style={styles.sectionIcon}>
                    <Icon name={section.icon} size={18} color="#FFFFFF" strokeWidth={1.8} />
                  </View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={18} color="#808089" />
                </Pressable>

                {isOpen && (
                  <View style={styles.sectionBody}>
                    <Text style={styles.intro}>{section.intro}</Text>

                    {section.steps.map((step, i) => (
                      <View key={i} style={styles.stepRow}>
                        <View style={styles.stepNum}>
                          <Text style={styles.stepNumText}>{i + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}

                    {section.tips && section.tips.length > 0 && (
                      <View style={styles.tipsBox}>
                        {section.tips.map((tip, i) => (
                          <View key={i} style={styles.tipRow}>
                            <Icon name="Lightbulb" size={13} color="#D4D4D8" />
                            <Text style={styles.tipText}>{tip}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Icon name="Search" size={28} color="#52525B" />
            <Text style={styles.emptyText}>{t("screens.noResultsFor", { query })}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },
  section: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sectionTitle: { flex: 1, color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 14, gap: 10 },
  intro: { color: "#A1A1AA", fontSize: 13, lineHeight: 19 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 1,
  },
  stepNumText: { color: "#E4E4E7", fontSize: 11, fontWeight: "700" },
  stepText: { flex: 1, color: "#D4D4D8", fontSize: 13, lineHeight: 19 },
  tipsBox: {
    marginTop: 2,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    gap: 6,
  },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipText: { flex: 1, color: "#D4D4D8", fontSize: 12, lineHeight: 17 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  emptyText: { color: "#808089", fontSize: 13, marginTop: 12 },
});
