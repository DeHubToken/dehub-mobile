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
  RefreshControl,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
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
  GOLD: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", label: "Au" },
  SILVER: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", label: "Ag" },
  COPPER: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", label: "Cu" },
  PLATINUM: { bg: "rgba(255,255,255,0.20)", fg: "#FFFFFF", label: "Pt" },
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

const ChangeBadge: React.FC<{ value: number | null; small?: boolean }> = ({ value, small }) => {
  if (value == null) return <Text style={styles.dim}>—</Text>;
  const up = value >= 0;
  return (
    <View style={[styles.changePill, { backgroundColor: up ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)" }]}>
      <Icon name={up ? "TrendingUp" : "TrendingDown"} size={small ? 10 : 11} color={up ? "#34D399" : "#F87171"} />
      <Text style={[styles.changeText, { color: up ? "#34D399" : "#F87171", fontSize: small ? 10.5 : 11.5 }]}>
        {Math.abs(value).toFixed(2)}%
      </Text>
    </View>
  );
};

const AssetRow: React.FC<{ asset: UnifiedAsset; rank: number; onPress: () => void }> = ({
  asset,
  rank,
  onPress,
}) => (
  <Pressable style={styles.row} onPress={onPress}>
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
    <View style={{ alignItems: "flex-end", gap: 4 }}>
      <Text style={styles.price}>{formatPrice(asset.price)}</Text>
      <ChangeBadge value={asset.change24h} small />
    </View>
  </Pressable>
);

export default function Top100Screen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const coins = useCmcTop100();
  const assets = useTopAssets();

  const [visible, setVisible] = useState(PAGE_SIZE);
  const [search, setSearch] = useState("");
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
        rightContent={<Icon name="ChartNoAxesColumn" size={22} color={theme.colors.accent} />}
      />

      <View style={styles.searchWrap}>
        <Icon name="Search" size={15} color="#71717A" />
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
            onPress={() => setSearch("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="X" size={15} color="#71717A" />
          </Pressable>
        )}
      </View>

      {isLoading && all.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FFFFFF" />
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
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 24,
            gap: 8,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
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
            <View style={styles.center}>
              <Icon name="ChartNoAxesColumn" size={40} color="#3F3F46" />
              <Text style={styles.dim}>
                {search ? t("top100.noSearchResults") : t("top100.loadFailed")}
              </Text>
            </View>
          }
        />
      )}

      {/* Reuses the app's existing cashtag sheet for the per-asset detail. */}
      <CashtagSheet
        visible={!!sheetSymbol}
        symbol={sheetSymbol ?? ""}
        onClose={() => setSheetSymbol(null)}
      />
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
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rank: { color: "#A1A1AA", fontSize: 11.5, fontWeight: "700", width: 24 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "800" },

  name: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "600" },
  symbol: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  price: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },

  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  changeText: { fontWeight: "700" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 10 },
  dim: { color: "#71717A", fontSize: 12.5, textAlign: "center" },
});
