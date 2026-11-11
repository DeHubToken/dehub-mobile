import { translateCopy as _translateCopy } from '../i18n/copy';
import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
/**
 * Top100Screen
 * ============
 * Native port of web's Top100CryptosPage (/app/top-100). Same two sources
 * merged and sorted by market cap, same 100-per-page paging.
 *
 * Web renders a wide table with columns that hide at breakpoints (1h / 7d /
 * volume). A phone has no room for that, so each row carries rank, asset,
 * price, 24h change and market cap, and the extra changes appear in the
 * expanded detail sheet instead.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  TextInput,
} from "react-native";

import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import { DeHubLoader } from "../components/DeHubLoader";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { PageEmpty } from "../components/page/PageKit";
import CashtagSheet from "../components/Home/CashtagSheet";
import { theme } from "../theme";
import { useTranslation } from "react-i18next";
import {
  useCmcTop100,
  useTopAssets,
  mergeAssets,
  formatPrice,
  formatLargeNumber,
  type UnifiedAsset,
} from "../hooks/useTopAssets";

const PAGE_SIZE = 100;

/** Metals keep their chemical-symbol pills; kinds are told apart by label only. */
const METAL_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  GOLD: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", get label() { return _translateCopy("copy.3325c2b56f2b", { defaultValue: "Au" }); } },
  SILVER: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", get label() { return _translateCopy("copy.468415f0e112", { defaultValue: "Ag" }); } },
  COPPER: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", get label() { return _translateCopy("copy.b62c681738d1", { defaultValue: "Cu" }); } },
  PLATINUM: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", get label() { return _translateCopy("copy.b602b7029be6", { defaultValue: "Pt" }); } },
};

const KIND_TINT: Record<string, string> = {
  crypto: "rgba(255,255,255,0.20)",
  stock: "rgba(255,255,255,0.16)",
  commodity: "rgba(255,255,255,0.16)",
};

const AssetBadge: React.FC<{ asset: UnifiedAsset }> = ({ asset }) => {
  const metal = METAL_COLORS[asset.symbol.toUpperCase()];
  if (metal) {
    return (
      <View style={[styles.badge, { backgroundColor: metal.bg }]}>
        <Text style={[styles.badgeText, { color: metal.fg }]}>{metal.label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: KIND_TINT[asset.kind] ?? "rgba(255,255,255,0.10)" }]}>
      <Text style={styles.badgeText}>{asset.symbol.slice(0, 3).toUpperCase()}</Text>
    </View>
  );
};

/** The day's move as plain coloured text, the way web's phone list shows it. */
const ChangeText: React.FC<{ value: number | null }> = ({ value }) => {
  if (value == null) return <Text style={styles.dim}>—</Text>;
  const up = value >= 0;
  return (
    <Text className={up ? "text-theme-green-400" : "text-theme-red-400"} style={styles.changeText}>
      {up ? "+" : ""}{value.toFixed(2)}%
    </Text>
  );
};

const AssetRow: React.FC<{ asset: UnifiedAsset; rank: number; onPress: () => void }> = ({
  asset,
  rank,
  onPress,
}) => {
  // One clean line per asset on every theme: no cards, one gutter.
  return (
  <Pressable onPress={onPress}>
    <View style={styles.row}>
    <Text style={styles.rank}>{rank}</Text>
    <AssetBadge asset={asset} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.name} numberOfLines={1}>
        {asset.name}
      </Text>
      <Text style={styles.symbol} numberOfLines={1}>
        {asset.symbol.toUpperCase()} · {formatLargeNumber(asset.marketCap)}
      </Text>
    </View>
    <View style={{ alignItems: "flex-end", gap: 2 }}>
      <Text style={styles.price}>{formatPrice(asset.price)}</Text>
      <ChangeText value={asset.change24h} />
    </View>
    </View>
  </Pressable>
  );
};

export default function Top100Screen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const coins = useCmcTop100();
  const assets = useTopAssets();

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [search, setSearch] = useSurfaceDraft("screens/Top100Screen.tsx:search", "");
  const [sheetSymbol, setSheetSymbol] = useState<string | null>(null);

  const all = useMemo(() => mergeAssets(assets.data, coins.data), [assets.data, coins.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (a) => a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q),
    );
  }, [all, search]);

  const shown = filtered.slice(0, visible);
  const isLoading = coins.isLoading || assets.isLoading;
  const refreshing = coins.isRefetching || assets.isRefetching;

  const onRefresh = useCallback(() => {
    void coins.refetch();
    void assets.refetch();
  }, [coins, assets]);

  // Rank is position in the unsorted-by-search list, so filtering doesn't
  // renumber rows — matches how web reads off market cap order.
  const rankOf = useCallback((a: UnifiedAsset) => all.indexOf(a) + 1, [all]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("top100.title")}
        subtitle={t("top100.subtitle")}
        icon="stats"
      />

      <View style={styles.searchWrap}>
        <Icon name="Search" size={15} color="#808089" />
        <TextInput
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setVisible(PAGE_SIZE);
          }}
          placeholder={t("top100.searchPlaceholder")}
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          autoCapitalize="characters"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => setSearch.complete(search, "")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("sidebar.clearSearch")}
          >
            <Icon name="X" size={15} color="#808089" />
          </Pressable>
        )}
      </View>

      {isLoading && all.length === 0 ? (
        <View style={styles.center}>
          <DeHubLoader size={56} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <AssetRow
              asset={item}
              rank={rankOf(item)}
              onPress={() => setSheetSymbol(item.symbol)}
            />
          )}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <DeHubRefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (visible < filtered.length) setVisible((v) => v + PAGE_SIZE);
          }}
          ListFooterComponent={
            visible < filtered.length ? (
              <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 14 }} />
            ) : null
          }
          ListEmptyComponent={
            <PageEmpty icon="stats" title={search ? t("top100.noSearchResults") : t("top100.loadFailed")} />
          }
        />
      )}

      {/* Reuses the app's existing cashtag sheet for the per-asset detail. */}
      <CashtagSheet
        visible={!!sheetSymbol}
        symbol={sheetSymbol ?? ""}
        onClose={() => setSheetSymbol(null)}
      />
      <DeHubRefreshMark refreshing={refreshing} />
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
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  rank: { color: "#A1A1AA", fontSize: 13, fontWeight: "600", width: 24, textAlign: "center", fontVariant: ["tabular-nums"] },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "800" },

  name: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  symbol: { color: "#A1A1AA", fontSize: 12.5, marginTop: 1 },
  price: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  changeText: { fontSize: 12.5, fontWeight: "600", fontVariant: ["tabular-nums"] },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  dim: { color: "#808089", fontSize: 12.5, textAlign: "center" },
});
