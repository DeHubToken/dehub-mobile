import { tokenLabel } from '../libs/token-label';
/**
 * LaunchpadCoinScreen
 * ===================
 * One launchpad coin (dehub.io/launchpad/:mintId): curve progress, price bars,
 * recent trades, stats, the fee split and the trade panel.
 *
 * The trade panel is left out of the App Store build — buying and selling a
 * coin is a token trade even while Phase 1 prices it as a mock
 * (config/storefront). Everything else is read-only and stays.
 */
import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { DeHubLoader } from "../components/DeHubLoader";
import { DhbCoin } from "../components/common/DhbCoin";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import {
  BondingCurveProgress,
  CoinThumb,
  CURVE_KEYS,
  FeeBreakdown,
  STATUS_KEYS,
  fmtUsd,
  shortAddress,
} from "../components/Launchpad/parts";
import { useUser } from "../context/AuthContext";
import { DIGITAL_PURCHASES_ENABLED } from "../config/storefront";
import { FIELD_TEXT } from "../theme/inputs";
import { sanitizeAmountInput } from "../libs/amount-input";
import { appLocale } from "../libs/date.util";
import { toastError, toastSuccess } from "../libs/toast";
import { ScreenNames } from "../navigation/ScreenNames";
import type { AppStackParamList } from "../navigation/types";
import { launchpadKeys, useLaunchpadToken, useLaunchpadTrades } from "../hooks/useLaunchpad";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import { chainLabel, mockLaunchpadTrade, type LaunchpadToken } from "../services/launchpad.service";

const QUICK_AMOUNTS = ["1", "10", "100", "1000"];

function TradePanel({ token }: { token: LaunchpadToken }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const user = useUser() as { walletAddress?: string; address?: string } | null;
  const wallet = user?.walletAddress || user?.address || null;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = token.status !== "bonding";

  const submit = async () => {
    if (!wallet) {
      navigation.navigate(ScreenNames.SignIn);
      return;
    }
    const n = Number(amount);
    if (!(n > 0)) {
      toastError(t("launchpad.enterAmount"));
      return;
    }
    setBusy(true);
    try {
      await mockLaunchpadTrade({ tokenId: token.id, side, amount: n, traderAddress: wallet });
      setAmount("");
      toastSuccess(t(side === "buy" ? "launchpad.boughtMock" : "launchpad.soldMock", { symbol: token.symbol }));
      queryClient.invalidateQueries({ queryKey: launchpadKeys.token(token.id) });
      queryClient.invalidateQueries({ queryKey: launchpadKeys.trades(token.id) });
    } catch (e) {
      toastError((e as Error)?.message || t("launchpad.tradeFailed"));
    } finally {
      setBusy(false);
    }
  };

  const label = closed
    ? t("launchpad.tradingClosed")
    : busy
      ? t("launchpad.submitting")
      : t(side === "buy" ? "launchpad.buySymbol" : "launchpad.sellSymbol", { symbol: token.symbol });

  return (
    <View style={styles.panel}>
      <View style={styles.segment}>
        {(["buy", "sell"] as const).map((s) => {
          const active = side === s;
          return (
            <Pressable
              key={s}
              onPress={() => setSide(s)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t(s === "buy" ? "launchpad.sideBuy" : "launchpad.sideSell")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>{t("launchpad.amountIn", { symbol: side === "buy" ? tokenLabel() : token.symbol })}</Text>
      <TextInput
        value={amount}
        onChangeText={(v) => setAmount(sanitizeAmountInput(v))}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor="rgba(255,255,255,0.3)"
        style={[styles.amountInput, FIELD_TEXT]}
      />
      <View style={styles.quickRow}>
        {QUICK_AMOUNTS.map((v) => (
          <Pressable key={v} onPress={() => setAmount(v)} style={styles.quickBtn} accessibilityRole="button">
            <Text style={styles.quickText}>{v}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={submit}
        disabled={closed || busy}
        style={[styles.tradeBtn, (closed || busy) && styles.tradeBtnDisabled]}
        accessibilityRole="button"
      >
        {busy && <DeHubLoader size={18} />}
        <Text style={[styles.tradeText, (closed || busy) && styles.tradeTextDisabled]}>{label}</Text>
      </Pressable>
      <Text style={styles.note}>{t("launchpad.mockTradeNote")}</Text>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowValue}>{v}</Text>
    </View>
  );
}

export default function LaunchpadCoinScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.LaunchpadCoin>>();
  const mintId = route.params?.mintId;
  const tokenQuery = useLaunchpadToken(mintId);
  const tradesQuery = useLaunchpadTrades(mintId);
  const token = tokenQuery.data;
  const trades = tradesQuery.data ?? [];

  // Chart scale — computed once, not per bar.
  const bars = useMemo(() => {
    const maxPrice = Math.max(...trades.map((x) => Number(x.price_per_token) || 0), 1e-9);
    return trades
      .slice()
      .reverse()
      .slice(-40)
      .map((x, i) => ({
        id: x.id,
        height: Math.max(4, Math.min(100, ((Number(x.price_per_token) || 0) / maxPrice) * 100)),
        opacity: 0.4 + (i / 40) * 0.6,
      }));
  }, [trades]);

  const refreshing = tokenQuery.isRefetching || tradesQuery.isRefetching;
  const onRefresh = () => {
    tokenQuery.refetch();
    tradesQuery.refetch();
  };

  let body: React.ReactNode;
  if (tokenQuery.isLoading) {
    body = (
      <View style={styles.center}>
        <DeHubLoader size={48} />
      </View>
    );
  } else if (tokenQuery.isError || !token) {
    body = (
      <View style={styles.center}>
        <Icon name="Search" size={44} color="#3F3F46" />
        <Text style={styles.emptyText}>
          {tokenQuery.isError ? t("launchpad.coinLoadFailed") : t("launchpad.coinNotFound")}
        </Text>
        {tokenQuery.isError && (
          <Pressable onPress={() => tokenQuery.refetch()} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>{t("launchpad.retry")}</Text>
          </Pressable>
        )}
      </View>
    );
  } else {
    const target = Number(token.graduation_target_usd) || 42000;
    body = (
      <View style={{ gap: 14 }}>
        {/* Header */}
        <View style={[styles.panel, styles.headRow]}>
          <CoinThumb token={token} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.coinName} numberOfLines={2}>
              {token.name} <Text style={styles.coinSymbol}>{`$${token.symbol}`}</Text>
            </Text>
            <Text style={styles.muted}>
              {`${t("launchpad.byCreator", { creator: shortAddress(token.creator_address) })} · ${chainLabel(token.chain_id)}`}
            </Text>
          </View>
          <BondingCurveProgress progressBps={token.progress_bps} size={64} />
        </View>

        {/* Graduation */}
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {t("launchpad.mcapToGraduation", { current: fmtUsd(token.market_cap_usd), target: fmtUsd(target) })}
          </Text>
          <Text style={styles.bannerStatus}>{t(STATUS_KEYS[token.status] ?? "launchpad.statusBonding")}</Text>
        </View>

        {/* Price bars */}
        <View style={[styles.panel, styles.chart]}>
          {bars.length === 0 ? (
            <Text style={styles.chartEmpty}>{t("launchpad.chartAfterFirstTrade")}</Text>
          ) : (
            bars.map((b) => (
              <View key={b.id} style={[styles.bar, { height: `${b.height}%`, opacity: b.opacity }]} />
            ))
          )}
        </View>

        {!!token.description && (
          <View style={styles.panel}>
            <Text style={styles.description}>{token.description}</Text>
          </View>
        )}

        {DIGITAL_PURCHASES_ENABLED && <TradePanel token={token} />}

        <View style={[styles.panel, { gap: 8 }]}>
          <Row k={t("launchpad.marketCap")} v={fmtUsd(token.market_cap_usd)} />
          <Row k={t("launchpad.volume24h")} v={fmtUsd(token.volume_24h)} />
          <Row
            k={t("launchpad.supplySold")}
            v={Math.floor(Number(token.supply_sold) || 0).toLocaleString(appLocale())}
          />
          <Row
            k={t("launchpad.curve")}
            v={t(CURVE_KEYS[token.curve_type ?? "standard"] ?? "launchpad.curveStandard")}
          />
          <Row k={t("launchpad.pair")} v={tokenLabel()} />
        </View>

        <FeeBreakdown />

        {/* Recent trades */}
        <View style={[styles.panel, { padding: 0 }]}>
          <Text style={styles.tradesHead}>{t("launchpad.recentTrades")}</Text>
          {trades.length === 0 && <Text style={[styles.muted, { padding: 16 }]}>{t("launchpad.noTrades")}</Text>}
          {trades.map((trade) => (
            <View key={trade.id} style={styles.tradeRow}>
              <Text style={[styles.tradeCell, trade.side !== "buy" && styles.tradeSell]}>
                {t(trade.side === "buy" ? "launchpad.sideBuy" : "launchpad.sideSell")}
              </Text>
              <Text style={[styles.tradeCell, styles.mono]} numberOfLines={1}>
                {shortAddress(trade.trader_address)}
              </Text>
              <Text style={[styles.tradeCell, { textAlign: "right" }]}>
                {Number(trade.dhb_in).toFixed(2)} <DhbCoin size={11} />
              </Text>
              <Text style={[styles.tradeCell, styles.tradeTime]}>
                {new Date(trade.created_at).toLocaleTimeString(appLocale(), { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={token ? `$${token.symbol}` : t("launchpad.title")} subtitle={token?.name} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<DeHubRefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
        >
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 72, gap: 12 },
  emptyText: { color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center" },
  retry: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  retryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 16,
    overflow: "hidden",
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  coinName: { color: "#FFFFFF", fontSize: 19, fontWeight: "700" },
  coinSymbol: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: "500" },
  muted: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  bannerText: { color: "rgba(255,255,255,0.7)", fontSize: 12, flex: 1 },
  bannerStatus: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  chart: { height: 200, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  chartEmpty: { flex: 1, alignSelf: "center", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 },
  bar: { flex: 1, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.6)" },
  description: { color: "rgba(255,255,255,0.8)", fontSize: 14, lineHeight: 20 },
  segment: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9 },
  segmentBtnActive: { backgroundColor: "#FFFFFF" },
  segmentText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },
  segmentTextActive: { color: "#000000" },
  fieldLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, textTransform: "uppercase", marginTop: 14 },
  amountInput: {
    marginTop: 6,
    height: 50,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  quickRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  quickBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  quickText: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  tradeBtn: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  tradeBtnDisabled: { backgroundColor: "rgba(255,255,255,0.10)" },
  tradeText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  tradeTextDisabled: { color: "rgba(255,255,255,0.6)" },
  note: { color: "rgba(255,255,255,0.4)", fontSize: 10, textAlign: "center", marginTop: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowKey: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  rowValue: { color: "#FFFFFF", fontSize: 14, textTransform: "capitalize" },
  tradesHead: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  tradeCell: { flex: 1, color: "#FFFFFF", fontSize: 12 },
  tradeSell: { color: "rgba(255,255,255,0.6)" },
  tradeTime: { color: "rgba(255,255,255,0.5)", textAlign: "right" },
  mono: { color: "rgba(255,255,255,0.7)", fontFamily: "monospace" },
});
