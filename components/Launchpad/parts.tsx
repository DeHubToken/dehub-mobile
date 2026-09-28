/**
 * The small pieces the launchpad screens share: the bonding-curve ring, a coin
 * card, the fee split, the trending strip and the live trade feed. Ports of
 * the web app's components/app/launchpad/*.
 */
import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { DhbCoin } from "../common/DhbCoin";
import type { LaunchpadToken, LaunchpadTrade } from "../../services/launchpad.service";

/** Status is a database slug; the reader wants their own language. */
export const STATUS_KEYS: Record<string, string> = {
  bonding: "launchpad.statusBonding",
  graduating: "launchpad.statusGraduating",
  graduated: "launchpad.statusGraduated",
};

export const CURVE_KEYS: Record<string, string> = {
  standard: "launchpad.curveStandard",
  fair: "launchpad.curveFair",
  stealth: "launchpad.curveStealth",
};

export function fmtUsd(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

export function fmtAge(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const shortAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

export function BondingCurveProgress({ progressBps, size = 48 }: { progressBps: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (Number(progressBps) || 0) / 100));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={3} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#FFFFFF"
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${c}`}
          strokeDashoffset={off}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={styles.ringText}>{`${pct.toFixed(0)}%`}</Text>
    </View>
  );
}

export function CoinThumb({ token, size }: { token: Pick<LaunchpadToken, "image_url" | "symbol">; size: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: size * 0.22 }]}>
      {token.image_url ? (
        <Image source={token.image_url} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Text style={[styles.thumbText, { fontSize: size * 0.3 }]}>{token.symbol.slice(0, 2)}</Text>
      )}
    </View>
  );
}

export function CoinCard({ token, onPress }: { token: LaunchpadToken; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button">
      <View style={styles.cardTop}>
        <CoinThumb token={token} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{token.name}</Text>
            <Text style={styles.symbol}>{`$${token.symbol}`}</Text>
          </View>
          <Text style={styles.muted}>{t("launchpad.ago", { age: fmtAge(token.created_at) })}</Text>
          {!!token.description && (
            <Text style={styles.desc} numberOfLines={2}>{token.description}</Text>
          )}
        </View>
        <BondingCurveProgress progressBps={token.progress_bps} />
      </View>
      <View style={styles.statRow}>
        <Stat label={t("launchpad.mcap")} value={fmtUsd(token.market_cap_usd)} />
        <Stat label={t("launchpad.vol24h")} value={fmtUsd(token.volume_24h)} />
        <Stat label={t("launchpad.status")} value={t(STATUS_KEYS[token.status] ?? "launchpad.statusBonding")} />
      </View>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function FeeBreakdown() {
  const { t } = useTranslation();
  const rows = [
    { labelKey: "launchpad.feeBurn", pct: 40 },
    { labelKey: "launchpad.feeStakers", pct: 30 },
    { labelKey: "launchpad.feeCreator", pct: 20 },
    { labelKey: "launchpad.feePlatform", pct: 10 },
  ];
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{t("launchpad.feeSplit")}</Text>
        <Text style={styles.muted}>{t("launchpad.feePerTrade")}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.labelKey} style={styles.feeRow}>
          <Text style={styles.feeLabel} numberOfLines={1}>{t(r.labelKey)}</Text>
          <View style={styles.feeTrack}>
            <View style={[styles.feeFill, { width: `${r.pct}%` }]} />
          </View>
          <Text style={styles.feePct}>{`${r.pct}%`}</Text>
        </View>
      ))}
    </View>
  );
}

export function TrendingBar({ tokens, onOpen }: { tokens: LaunchpadToken[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.panel, { padding: 0 }]}>
      <View style={styles.trendHead}>
        <Icon name="Flame" size={14} color="rgba(255,255,255,0.8)" />
        <Text style={styles.trendTitle}>{t("launchpad.trending")}</Text>
        <Text style={styles.trendHint} numberOfLines={1}>{t("launchpad.trendingHint")}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 8 }}>
        {tokens.map((tok, i) => (
          <Pressable key={tok.id} style={styles.trendChip} onPress={() => onOpen(tok.id)} accessibilityRole="button">
            <Text style={styles.trendRank}>{`#${i + 1}`}</Text>
            <CoinThumb token={tok} size={28} />
            <View>
              <Text style={styles.trendSymbol}>{`$${tok.symbol}`}</Text>
              <View style={styles.trendVol}>
                <Icon name="TrendingUp" size={10} color="rgba(255,255,255,0.5)" />
                <Text style={styles.trendVolText}>{fmtUsd(tok.volume_24h)}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function LiveActivity({ trades }: { trades: LaunchpadTrade[] }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.panel, { padding: 0 }]}>
      <View style={styles.trendHead}>
        <View style={styles.liveDot} />
        <Text style={styles.trendTitle}>{t("launchpad.liveActivity")}</Text>
      </View>
      {trades.length === 0 && <Text style={[styles.muted, { padding: 16 }]}>{t("launchpad.noTrades")}</Text>}
      {trades.map((trade) => (
        <View key={trade.id} style={styles.tradeRow}>
          <Icon
            name={trade.side === "buy" ? "ArrowUpRight" : "ArrowDownLeft"}
            size={14}
            color={trade.side === "buy" ? "#FFFFFF" : "rgba(255,255,255,0.6)"}
          />
          <Text style={styles.mono} numberOfLines={1}>{shortAddress(trade.trader_address)}</Text>
          <Text style={styles.muted}>{t(trade.side === "buy" ? "launchpad.bought" : "launchpad.sold")}</Text>
          <Text style={styles.tradeAmount}>
            {Number(trade.dhb_in).toFixed(2)} <DhbCoin size={11} />
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ringText: { color: "#FFFFFF", fontSize: 10, fontWeight: "600" },
  thumb: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbText: { color: "rgba(255,255,255,0.6)", fontWeight: "700" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 16,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", flexShrink: 1 },
  symbol: { color: "rgba(255,255,255,0.5)", fontSize: 12, textTransform: "uppercase" },
  muted: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 },
  desc: { color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 17, marginTop: 6 },
  statRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  stat: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)" },
  statLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase" },
  statValue: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginTop: 2 },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 16,
    overflow: "hidden",
  },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  panelTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  feeRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  feeLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, width: 96 },
  feeTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  feeFill: { height: "100%", backgroundColor: "rgba(255,255,255,0.6)" },
  feePct: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", width: 34, textAlign: "right" },
  trendHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  trendTitle: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  trendHint: { color: "rgba(255,255,255,0.4)", fontSize: 10, flexShrink: 1 },
  trendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  trendRank: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "700" },
  trendSymbol: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  trendVol: { flexDirection: "row", alignItems: "center", gap: 3 },
  trendVolText: { color: "rgba(255,255,255,0.5)", fontSize: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  tradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  mono: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "monospace", flexShrink: 1 },
  tradeAmount: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginLeft: "auto" },
});
