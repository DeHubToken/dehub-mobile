/**
 * Every open listing across every post — the market's front door. Before this
 * a fraction could only be bought by someone who already knew which post they
 * wanted.
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl } from "../Feed/DeHubRefreshControl";
import FractionTile from "./FractionTile";
import SellerTrustBadge from "./SellerTrustBadge";
import { fmt, padGrid, shortAddress } from "./fractionFormat";
import { cdnImage } from "../../libs/cdnImage";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useTokenPrices } from "../../hooks/useStores";
import {
  FRACTION_SORTS,
  TOTAL_FRACTIONS,
  useFractionWallet,
  useMarketListings,
  useSellerStatsBatch,
  type FractionListing,
  type MarketSort,
} from "../../hooks/useFractionMarket";

interface Props {
  onOpenListing: (listing: FractionListing) => void;
}

const BrowseFractionsTab: React.FC<Props> = ({ onOpenListing }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const wallet = useFractionWallet();
  const [sort, setSort] = useState<MarketSort>("newest");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const { data: listings = [], isLoading, isError, refetch, isRefetching } = useMarketListings(sort, debounced);
  const { data: sellerStats = {} } = useSellerStatsBatch(listings.map((l) => l.seller_address));
  const { data: prices } = useTokenPrices();
  const dhbUsd = prices?.DHB ?? 0;

  // Cheapest ask on the whole board — whether fractions are worth anything yet.
  const floor = useMemo(
    () => (listings.length ? Math.min(...listings.map((l) => l.price_per_fraction)) : null),
    [listings],
  );

  const renderItem = ({ item }: { item: FractionListing | null }) => {
    // The odd tile out gets an empty partner so it keeps half the row instead
    // of stretching across all of it.
    if (!item) return <View style={styles.spacer} />;
    const available = item.quantity - item.filled_quantity;
    const totalDhb = available * item.price_per_fraction;
    const sharePct = ((available / TOTAL_FRACTIONS) * 100).toFixed(1);
    return (
      <FractionTile
        tokenId={item.token_id}
        title={item.post_title}
        imageUrl={item.post_image_url ? cdnImage(item.post_image_url, { width: 200 }) : null}
        postType={item.post_type}
        units={available}
        showYours={item.seller_address.toLowerCase() === wallet}
        onPress={() => onOpenListing(item)}
      >
        <View style={styles.inline}>
          <Icon name="Users" size={11} color="#808089" />
          <Text style={styles.creator} numberOfLines={1}>
            {item.creator_username || shortAddress(item.seller_address)}
          </Text>
        </View>
        <View style={styles.inline}>
          <DhbCoin size={14} />
          <Text style={styles.price}>{fmt(item.price_per_fraction, 4)}</Text>
          <Text style={styles.unit}>{t("fractions.perFractionShort")}</Text>
        </View>
        <Text style={styles.meta} numberOfLines={2}>
          {fmt(totalDhb)} <DhbCoin size={10} /> {t("fractions.forShareOfPost", { pct: sharePct })}
          {dhbUsd > 0 ? ` · $${fmt(totalDhb * dhbUsd)}` : ""}
        </Text>
        <SellerTrustBadge stats={sellerStats[item.seller_address.toLowerCase()]} compact />
      </FractionTile>
    );
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.searchWrap}>
        <Icon name="Search" size={15} color="#808089" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("fractions.searchPlaceholder")}
          placeholderTextColor="#8B8D90"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityRole="button">
            <Icon name="X" size={15} color="#808089" />
          </Pressable>
        )}
      </View>
      {/* flexGrow: 0 is load-bearing — a horizontal ScrollView grows by default
          and would squash the grid below it. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {FRACTION_SORTS.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => setSort(s.value)}
            style={[styles.chip, sort === s.value && styles.chipActive]}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, sort === s.value && styles.chipTextActive]}>{t(s.labelKey)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {floor !== null && (
        <View style={styles.floorRow}>
          <Text style={styles.floor}>{t("fractions.listingsFloor", { count: listings.length })} </Text>
          <Text style={styles.floorValue}>{fmt(floor, 4)} </Text>
          <DhbCoin size={11} />
          <Text style={styles.floor}> {t("fractions.perFraction")}</Text>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      data={isLoading || isError ? [] : padGrid(listings)}
      keyExtractor={(l, i) => l?.id ?? `spacer-${i}`}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={<DeHubRefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#fff" />}
      ListEmptyComponent={
        isLoading ? (
          <View style={styles.center}>
            <DeHubLoader size={56} />
          </View>
        ) : (
          <View style={styles.center}>
            <Icon name="Tag" size={40} color="#3F3F46" />
            <Text style={styles.emptyText}>
              {isError
                ? t("fractions.loadFailed")
                : t(debounced ? "fractions.noSearchMatch" : "fractions.noneForSale")}
            </Text>
            {!debounced && !isError && <Text style={styles.emptyHint}>{t("fractions.startTheMarketHint")}</Text>}
          </View>
        )
      }
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 12 },
  gridRow: { gap: 12 },
  spacer: { flex: 1 },
  header: { gap: 2 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, padding: 0 },
  chipScroll: { flexGrow: 0, marginHorizontal: -16 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipActive: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.5)" },
  chipText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600", flexShrink: 0 },
  chipTextActive: { color: "#FFFFFF" },
  floorRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", paddingBottom: 4 },
  floor: { color: "#808089", fontSize: 11.5 },
  floorValue: { color: "#D4D4D8", fontSize: 11.5, fontWeight: "600" },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  creator: { flex: 1, color: "#A1A1AA", fontSize: 11 },
  price: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flexShrink: 0 },
  unit: { color: "#808089", fontSize: 10, flexShrink: 0 },
  meta: { color: "#808089", fontSize: 10, lineHeight: 14 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 10 },
  emptyText: { color: "#A1A1AA", fontSize: 13, textAlign: "center" },
  emptyHint: { color: "#808089", fontSize: 12, textAlign: "center", paddingHorizontal: 24 },
});

export default BrowseFractionsTab;
