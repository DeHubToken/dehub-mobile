/**
 * LaunchpadScreen
 * ===============
 * Native port of the web Launchpad (dehub.io/launchpad): browse coins on the
 * DHB-paired bonding curve, filter and search them, see what is trending and
 * the live trade feed.
 *
 * Browsing is read-only and stays open everywhere. "Create coin" is a token
 * launch, so it is left out of the App Store build (config/storefront).
 */
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { DeHubLoader } from "../components/DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { CoinCard, LiveActivity, TrendingBar } from "../components/Launchpad/parts";
import { useUser } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { FIELD_TEXT } from "../theme/inputs";
import { ScreenNames } from "../navigation/ScreenNames";
import { useLaunchpadTokens, useLaunchpadTrades, useTrendingLaunchpadTokens } from "../hooks/useLaunchpad";
import type { LaunchpadFilter, LaunchpadToken } from "../services/launchpad.service";

const FILTERS: { id: LaunchpadFilter; labelKey: string }[] = [
  { id: "new", labelKey: "launchpad.filterNew" },
  { id: "graduating", labelKey: "launchpad.filterGraduating" },
  { id: "trending", labelKey: "launchpad.filterTrending" },
  { id: "graduated", labelKey: "launchpad.filterGraduated" },
  { id: "mine", labelKey: "launchpad.filterMine" },
];

export default function LaunchpadScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const wallet = user?.walletAddress || user?.address || null;

  const [filter, setFilter] = useState<LaunchpadFilter>("new");
  const [search, setSearch] = useState("");

  const tokensQuery = useLaunchpadTokens(filter, wallet);
  const trendingQuery = useTrendingLaunchpadTokens();
  const tradesQuery = useLaunchpadTrades(undefined, 30);

  const tokens = tokensQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (x) =>
        x.name.toLowerCase().includes(q) ||
        x.symbol.toLowerCase().includes(q) ||
        x.creator_address.toLowerCase().includes(q),
    );
  }, [tokens, search]);

  const openCoin = useCallback(
    (id: string) => navigation.navigate(ScreenNames.LaunchpadCoin, { mintId: id }),
    [navigation],
  );
  const openCreate = useCallback(() => navigation.navigate(ScreenNames.LaunchpadCreate), [navigation]);

  const refreshing = tokensQuery.isRefetching;
  const onRefresh = useCallback(() => {
    tokensQuery.refetch();
    trendingQuery.refetch();
    tradesQuery.refetch();
  }, [tokensQuery, trendingQuery, tradesQuery]);

  const header = (
    <View style={{ gap: 14, marginBottom: 14 }}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.badgeRow}>
          <Icon name="Rocket" size={13} color="rgba(255,255,255,0.6)" />
          <Text style={styles.badge}>{t("launchpad.phaseBadge")}</Text>
        </View>
        <Text style={styles.heroTitle}>{t("launchpad.heroTitle")}</Text>
        <Text style={styles.heroSub}>{t("launchpad.heroSubtitle")}</Text>
        {DIGITAL_PURCHASES_ENABLED && (
          <Pressable style={styles.createBtn} onPress={openCreate} accessibilityRole="button">
            <Icon name="Plus" size={16} color="#000000" />
            <Text style={styles.createText}>{t("launchpad.createCoin")}</Text>
          </Pressable>
        )}
      </View>

      {/* Filters */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f.id}
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
        renderItem={({ item: f }) => {
          const active = filter === f.id;
          return (
            <Pressable
              onPress={() => setFilter(f.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(f.labelKey)}</Text>
            </Pressable>
          );
        }}
      />

      {/* Search */}
      <View style={styles.searchBox}>
        <Icon name="Search" size={16} color="rgba(255,255,255,0.4)" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("launchpad.searchPlaceholder")}
          placeholderTextColor="rgba(255,255,255,0.4)"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, FIELD_TEXT]}
        />
      </View>

      {(trendingQuery.data?.length ?? 0) > 0 && (
        <TrendingBar tokens={trendingQuery.data ?? []} onOpen={openCoin} />
      )}
    </View>
  );

  const empty = tokensQuery.isLoading ? (
    <View style={styles.center}>
      <DeHubLoader size={48} />
    </View>
  ) : tokensQuery.isError ? (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{t("launchpad.loadFailed")}</Text>
      <Pressable onPress={() => tokensQuery.refetch()} style={styles.linkBtn} accessibilityRole="button">
        <Text style={styles.linkText}>{t("launchpad.retry")}</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{t("launchpad.noCoins")}</Text>
      {DIGITAL_PURCHASES_ENABLED && !search && (
        <Pressable onPress={openCreate} style={styles.linkBtn} accessibilityRole="button">
          <Text style={styles.linkText}>{t("launchpad.beTheFirst")}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={t("launchpad.title")} />
      <FlatList
        data={filtered}
        keyExtractor={(x: LaunchpadToken) => x.id}
        renderItem={({ item }) => <CoinCard token={item} onPress={() => openCoin(item.id)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={{ marginTop: 14 }}>
            <LiveActivity trades={tradesQuery.data ?? []} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
      />
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 18,
  },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { color: "rgba(255,255,255,0.6)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 6 },
  heroSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 19, marginTop: 4 },
  createBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  createText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },
  chipText: { color: "#A1A1AA", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#000000" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14 },
  center: { alignItems: "center", paddingVertical: 48 },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 36,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 14 },
  linkBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  linkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
});
