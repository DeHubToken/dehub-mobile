/**
 * Explore's clean list
 * ====================
 * What Explore shows under the search pill before anyone types. Twin of
 * web's ExplorePhoneHome: no bentos, one gutter, titled sections split by a
 * hairline, each with a quiet "See all".
 *
 *   Recent searches   (only when there are some)
 *   Trending          top hashtags, numbered, 5 then See all
 *   Live now          who is broadcasting (only when someone is)
 *   Top tokens        most searched tickers, two columns
 *   Follow suggestions / New members   one line per person with Follow
 *
 * The category words sit above this in SearchScreen, and the week's trending
 * posts follow below it.
 */
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import Icon from "../ui/Icon";
import { ExploreSection, EXPLORE_GUTTER, exploreRowStyles as row } from "./ExploreSection";
import TickerLogo from "./TickerLogo";
import { useTrendingCategories } from "../../hooks/useTrendingCategories";
import { supabase } from "../../services/supabase";
import { useLiveNowItems, LiveFace } from "../Home/LiveNowBar";
import SuggestedAccountsSection from "../Home/SuggestedAccountsSection";
import NewMembersRail from "../common/NewMembersRail";

const TOPICS_COLLAPSED = 5;
const TOPICS_EXPANDED = 10;
const TOKENS_COLLAPSED = 6;
const TOKENS_EXPANDED = 10;
const RECENT_COLLAPSED = 4;
const LIVE_COLLAPSED = 3;

/** Most searched tickers, the same table web's Top tokens reads. */
function useTopTickers() {
  return useQuery({
    queryKey: ["explore-top-tickers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticker_searches")
        .select("symbol, search_count")
        .order("search_count", { ascending: false })
        .limit(TOKENS_EXPANDED);
      if (error || !data) return [] as { symbol: string; search_count: number }[];
      return data as { symbol: string; search_count: number }[];
    },
    staleTime: 120_000,
  });
}

/** Category words under the pill. Null is "For you" (no category). */
export function ExploreCategoryWords({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string | null;
  onChange: (category: string | null) => void;
}) {
  const { t } = useTranslation();
  const items: { id: string | null; name: string }[] = [
    { id: null, name: t("filters.forYou", { defaultValue: "For You" }) },
    ...categories.map((c) => ({ id: c, name: c })),
  ];
  return (
    <View style={styles.wordsWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.words}>
        {items.map((c) => {
          const active = value === c.id;
          return (
            <Pressable key={c.id ?? "for-you"} onPress={() => onChange(c.id)} style={styles.word} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text
                className={active ? "text-white" : "text-theme-neutrals-500"}
                style={[styles.wordText, active && styles.wordTextActive]}
              >
                {c.name.charAt(0).toUpperCase() + c.name.slice(1)}
              </Text>
              {active ? <View className="bg-white" style={styles.underline} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <View className="bg-theme-neutrals-800" style={styles.wordsHairline} />
    </View>
  );
}

export default function ExploreCleanList({
  recentSearches,
  onSearch,
  onRemoveSearch,
  onClearSearches,
  onTopic,
  onNewMembersLayout,
}: {
  recentSearches: string[];
  onSearch: (term: string) => void;
  onRemoveSearch: (term: string) => void;
  onClearSearches: () => void;
  onTopic: (name: string) => void;
  /** Where New members landed, for the Live Stats deep link to scroll to it. */
  onNewMembersLayout?: (layout: { y: number; height: number }) => void;
}) {
  const { t } = useTranslation();
  const [recentOpen, setRecentOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);

  // This week's tags; the all-time list stands in while the week is thin.
  const { data: weekTopics = [] } = useTrendingCategories("1w");
  const { data: allTopics = [] } = useTrendingCategories("all");
  const weekly = weekTopics.length >= TOPICS_COLLAPSED;
  const topics = weekly ? weekTopics : allTopics;
  const { data: tickers = [] } = useTopTickers();
  const { items: live, open: openLive } = useLiveNowItems();

  const seeAll = t("stages.seeAll", { defaultValue: "See all" });
  const showLess = t("copy.94ea9b1d33a0", { defaultValue: "Show less" });
  let first = true;
  const isFirst = () => {
    const was = first;
    first = false;
    return was;
  };

  const shownRecent = recentOpen ? recentSearches : recentSearches.slice(0, RECENT_COLLAPSED);
  const hiddenRecent = Math.max(0, recentSearches.length - RECENT_COLLAPSED);
  const shownTopics = topics.slice(0, topicsOpen ? TOPICS_EXPANDED : TOPICS_COLLAPSED);
  const shownTokens = tickers.slice(0, tokensOpen ? TOKENS_EXPANDED : TOKENS_COLLAPSED);
  const shownLive = liveOpen ? live : live.slice(0, LIVE_COLLAPSED);

  return (
    <View>
      {recentSearches.length > 0 && (
        <ExploreSection
          first={isFirst()}
          icon="search"
          title={t("bookmarks.recent", { defaultValue: "Recent" })}
          action={t("explorePage.clearAll", { defaultValue: "Clear all" })}
          onAction={onClearSearches}
          chevron={false}
        >
          {shownRecent.map((term) => (
            <View key={term} style={styles.recentRow}>
              <Pressable onPress={() => onSearch(term)} style={[row.flex, styles.recentHit]}>
                <Icon name="Search" size={16} color="#71717A" />
                <Text className="text-white" style={[row.flex, styles.recentText]} numberOfLines={1}>{term}</Text>
              </Pressable>
              <Pressable
                onPress={() => onRemoveSearch(term)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("search.removeFromHistory", { query: term, defaultValue: "Remove {{query}}" })}
              >
                <Icon name="X" size={14} color="#71717A" />
              </Pressable>
            </View>
          ))}
          {hiddenRecent ? (
            <Pressable onPress={() => setRecentOpen((v) => !v)} style={styles.more}>
              <Text className="text-theme-neutrals-400" style={styles.moreText}>
                {recentOpen ? showLess : t("features.topBuilders.showMore", { defaultValue: "Show {{n}} more", n: hiddenRecent })}
              </Text>
            </Pressable>
          ) : null}
        </ExploreSection>
      )}

      {topics.length > 0 && (
        <ExploreSection
          first={isFirst()}
          icon="stats"
          title={t("explorePage.trending", { defaultValue: "Trending" })}
          action={topics.length > TOPICS_COLLAPSED ? (topicsOpen ? showLess : seeAll) : undefined}
          onAction={() => setTopicsOpen((v) => !v)}
          chevron={!topicsOpen}
        >
          {shownTopics.map((topic, i) => (
            <Pressable key={topic.name} onPress={() => onTopic(topic.name)} style={row.row}>
              <Text className="text-theme-neutrals-500" style={row.rank}>{i + 1}</Text>
              <View style={row.flex}>
                <Text className="text-white" style={row.name} numberOfLines={1}>
                  #{topic.name.charAt(0).toUpperCase() + topic.name.slice(1)}
                </Text>
                {/* A paid spot says so; the count stays the real one. */}
                <Text className="text-theme-neutrals-500" style={row.sub} numberOfLines={1}>
                  {topic.boosted ? `${t("work.boosted", { defaultValue: "Boosted" })} · ` : ""}
                  {t("explore.postCount", { defaultValue: "{{count}} posts", count: Number(topic.post_count) || 0 })}
                </Text>
              </View>
              <Icon name="ChevronRight" size={16} color="#52525B" />
            </Pressable>
          ))}
        </ExploreSection>
      )}

      {live.length > 0 && (
        <ExploreSection
          first={isFirst()}
          icon="live"
          title={t("stages.liveNow", { defaultValue: "Live now" })}
          action={live.length > LIVE_COLLAPSED ? (liveOpen ? showLess : seeAll) : undefined}
          onAction={() => setLiveOpen((v) => !v)}
          chevron={!liveOpen}
        >
          {shownLive.map((item) => (
            <Pressable key={`${item.kind}-${item.id}`} onPress={() => void openLive(item)} style={row.row}>
              <LiveFace item={item} size={40} />
              <View style={row.flex}>
                <Text className="text-white" style={row.name} numberOfLines={1}>
                  {item.username ? `@${item.username}` : item.title}
                </Text>
                <Text className="text-theme-neutrals-500" style={row.sub} numberOfLines={1}>{item.title}</Text>
              </View>
              <View style={styles.livePill}>
                <Text style={styles.livePillText}>{t("stages.live", { defaultValue: "LIVE" })}</Text>
              </View>
            </Pressable>
          ))}
        </ExploreSection>
      )}

      {tickers.length > 0 && (
        <ExploreSection
          first={isFirst()}
          icon="buy"
          title={t("copy.a039dfb9628b", { defaultValue: "Tokens" })}
          action={tickers.length > TOKENS_COLLAPSED ? (tokensOpen ? showLess : seeAll) : undefined}
          onAction={() => setTokensOpen((v) => !v)}
          chevron={!tokensOpen}
        >
          <View style={styles.tokenGrid}>
            {shownTokens.map((tk, i) => (
              <Pressable key={tk.symbol} onPress={() => onSearch(`$${tk.symbol}`)} style={styles.token}>
                <Text className="text-theme-neutrals-500" style={styles.tokenRank}>{i + 1}</Text>
                <TickerLogo symbol={tk.symbol} size={22} />
                <Text className="text-white" style={[row.name, row.flex]} numberOfLines={1}>${tk.symbol}</Text>
              </Pressable>
            ))}
          </View>
        </ExploreSection>
      )}

      <SuggestedAccountsSection surface="explore" layout="rows" />
      <View onLayout={(e) => onNewMembersLayout?.(e.nativeEvent.layout)}>
        <NewMembersRail layout="rows" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wordsWrap: { marginHorizontal: EXPLORE_GUTTER },
  words: { gap: 20, paddingRight: 8 },
  word: { paddingTop: 6, paddingBottom: 10 },
  wordText: { fontSize: 15, fontWeight: "500" },
  wordTextActive: { fontWeight: "600" },
  underline: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, zIndex: 1 },
  wordsHairline: { height: StyleSheet.hairlineWidth },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  recentHit: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  recentText: { fontSize: 15 },
  more: { paddingVertical: 6 },
  moreText: { fontSize: 13, fontWeight: "500" },
  livePill: { backgroundColor: "#EF4444", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  livePillText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  tokenGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
  token: { width: "47%", flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  tokenRank: { width: 16, fontSize: 12, fontWeight: "600" },
});
