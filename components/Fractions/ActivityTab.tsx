/**
 * The tape: what has actually traded, market-wide.
 *
 * The listing grid only shows what people are asking, which is exactly the
 * number that is wrong when nothing is selling. Settled trades are the only
 * prices here somebody actually paid, so a first-time seller prices off this.
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl } from "../Feed/DeHubRefreshControl";
import { fmt, relativeTime, shortAddress, OK, WARN } from "./fractionFormat";
import { useTokenPrices } from "../../hooks/useStores";
import { useRecentTrades, type FractionTrade } from "../../hooks/useFractionMarket";

const STATUS: Record<string, { key: string; color: string }> = {
  settled: { key: "fractions.statusSettled", color: OK },
  awaiting_delivery: { key: "fractions.statusAwaitingFractions", color: WARN },
  awaiting_payment: { key: "fractions.statusAwaitingPayment", color: WARN },
};

interface Props {
  onOpenPost: (tokenId: string) => void;
}

const ActivityTab: React.FC<Props> = ({ onOpenPost }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: trades = [], isLoading, refetch, isRefetching } = useRecentTrades(40);
  const { data: prices } = useTokenPrices();
  const dhbUsd = prices?.DHB ?? 0;

  const summary = useMemo(() => {
    const settled = trades.filter((trade) => trade.status === "settled");
    if (!settled.length) return null;
    const volume = settled.reduce((sum, trade) => sum + trade.quantity * trade.price_per_fraction, 0);
    const fractions = settled.reduce((sum, trade) => sum + trade.quantity, 0);
    return { count: settled.length, volume, avgPrice: fractions > 0 ? volume / fractions : 0 };
  }, [trades]);

  const renderItem = ({ item }: { item: FractionTrade }) => {
    const status = STATUS[item.status] || STATUS.settled;
    return (
      <Pressable
        style={styles.row}
        onPress={() => onOpenPost(item.token_id)}
        accessibilityRole="button"
        accessibilityLabel={t("fractions.postNumber", { id: item.token_id })}
      >
        <View style={styles.rowHead}>
          <Text style={styles.post} numberOfLines={1}>
            {t("fractions.postNumber", { id: item.token_id })}
          </Text>
          <Icon name="Clock" size={11} color="#52525B" />
          <Text style={styles.time}>{relativeTime(item.created_at, t)}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowMain}>
            <Text style={styles.qty}>{t("fractions.fractionCount", { count: item.quantity })}</Text>
            <View style={styles.inline}>
              <Text style={styles.addr}>{shortAddress(item.seller_address)}</Text>
              <Icon name="ArrowRight" size={11} color="#52525B" />
              <Text style={styles.addr}>{shortAddress(item.buyer_address)}</Text>
            </View>
          </View>
          <View style={styles.rowRight}>
            <View style={styles.inline}>
              <DhbCoin size={13} />
              <Text style={styles.total}>{fmt(item.quantity * item.price_per_fraction)}</Text>
            </View>
            <Text style={[styles.status, { color: status.color }]}>{t(status.key)}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const header = summary ? (
    <View style={styles.stats}>
      <View style={styles.stat}>
        <Text style={styles.statLabel}>{t("fractions.trades")}</Text>
        <Text style={styles.statValue}>{summary.count}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.statLabel}>{t("fractions.volume")}</Text>
        <View style={styles.inline}>
          <Text style={styles.statValue}>{fmt(summary.volume, 0)}</Text>
          <DhbCoin size={11} />
        </View>
      </View>
      <View style={styles.stat}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {t("fractions.avgPerFraction")}
        </Text>
        <Text style={styles.statValue}>{fmt(summary.avgPrice, 3)}</Text>
        {dhbUsd > 0 && <Text style={styles.statSub}>${(summary.avgPrice * dhbUsd).toFixed(4)}</Text>}
      </View>
    </View>
  ) : null;

  return (
    <FlatList
      data={isLoading ? [] : trades}
      keyExtractor={(trade) => trade.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<DeHubRefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#fff" />}
      ListEmptyComponent={
        <View style={styles.center}>
          {isLoading ? (
            <DeHubLoader size={56} />
          ) : (
            <>
              <Icon name="Activity" size={40} color="#3F3F46" />
              <Text style={styles.emptyText}>{t("fractions.nothingTradedYet")}</Text>
            </>
          )}
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 8 },
  stats: { flexDirection: "row", gap: 8, marginBottom: 6 },
  stat: {
    flex: 1,
    padding: 12,
    gap: 3,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  statLabel: { color: "#808089", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", flexShrink: 0 },
  statSub: { color: "#808089", fontSize: 10 },
  row: {
    padding: 12,
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  post: { flex: 1, color: "#A1A1AA", fontSize: 12 },
  time: { color: "#52525B", fontSize: 10.5, flexShrink: 0 },
  rowBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowMain: { flex: 1, minWidth: 0, gap: 3 },
  rowRight: { alignItems: "flex-end", gap: 3, flexShrink: 0 },
  qty: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  inline: { flexDirection: "row", alignItems: "center", gap: 4 },
  addr: { color: "#808089", fontSize: 11, fontFamily: "monospace" },
  total: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", flexShrink: 0 },
  status: { fontSize: 10.5, fontWeight: "500" },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 10 },
  emptyText: { color: "#A1A1AA", fontSize: 13, textAlign: "center" },
});

export default ActivityTab;
