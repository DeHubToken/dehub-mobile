import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from "react-native";
import Svg, { Path, G, Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import Icon from "../components/ui/Icon";
import InviteFriendsCard from "../components/common/InviteFriendsCard";
import EarningsComparisonCard from "../components/Earnings/EarningsComparisonCard";
import { supabase } from "../services/supabase";
import { useUser, useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";

// ─── Types ───────────────────────────────────────────────────────────────────
interface TipRecord {
  amount: number;
  created_at: string;
  sender_address: string;
  token_id: string | null;
}

interface PpvRecord {
  amount: number;
  created_at: string;
  buyer_address: string;
  token_id: string;
}

type TimeFilter = "1d" | "1w" | "1m" | "all";

const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
  { key: "1d", label: "24h" },
  { key: "1w", label: "7d" },
  { key: "1m", label: "30d" },
  { key: "all", label: "All" },
];

const SOURCE_COLORS = {
  tips: "#22C55E",
  ppv: "#D4D4D8",
};

function filterByTime<T extends { created_at: string }>(
  records: T[],
  filter: TimeFilter,
): T[] {
  if (filter === "all") return records;
  const now = Date.now();
  const ms = filter === "1d" ? 86400000 : filter === "1w" ? 604800000 : 2592000000;
  return records.filter((r) => now - new Date(r.created_at).getTime() <= ms);
}

function fmtAmount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Pie chart (SVG) ─────────────────────────────────────────────────────────
function PieChart({ tips, ppv }: { tips: number; ppv: number }) {
  const total = tips + ppv;
  const R = 60, CX = 70, CY = 70;

  if (total === 0) {
    return (
      <View style={{ width: 140, height: 140, alignItems: "center", justifyContent: "center" }}>
        <Svg width={140} height={140}>
          <Circle cx={CX} cy={CY} r={R} fill="none" stroke="#27272A" strokeWidth={20} />
        </Svg>
        <View style={StyleSheet.absoluteFill as any}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#6F7174", fontSize: 11 }}>No data</Text>
          </View>
        </View>
      </View>
    );
  }

  // Build arcs
  const slices: { pct: number; color: string; label: string }[] = [
    { pct: tips / total, color: SOURCE_COLORS.tips, label: "Tips" },
    { pct: ppv / total, color: SOURCE_COLORS.ppv, label: "PPV" },
  ].filter((s) => s.pct > 0);

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const ir = R - 18; // inner radius for donut

  let startAngle = -90;
  const paths: { d: string; color: string }[] = slices.map((s) => {
    const sweep = s.pct * 360;
    const end = startAngle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;

    const x1 = CX + R * Math.cos(toRad(startAngle));
    const y1 = CY + R * Math.sin(toRad(startAngle));
    const x2 = CX + R * Math.cos(toRad(end));
    const y2 = CY + R * Math.sin(toRad(end));

    const ix1 = CX + ir * Math.cos(toRad(startAngle));
    const iy1 = CY + ir * Math.sin(toRad(startAngle));
    const ix2 = CX + ir * Math.cos(toRad(end));
    const iy2 = CY + ir * Math.sin(toRad(end));

    const d = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${ir} ${ir} 0 ${largeArc} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");

    startAngle = end;
    return { d, color: s.color };
  });

  return (
    <View style={{ width: 140, height: 140 }}>
      <Svg width={140} height={140}>
        <G>
          {paths.map((p, i) => (
            <Path key={i} d={p.d} fill={p.color} />
          ))}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill as any, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: "#F9FBFF", fontSize: 14, fontWeight: "700" }}>
          {fmtAmount(total)}
        </Text>
        <Text style={{ color: "#8B8D90", fontSize: 12 }}>DHB</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
const EarningsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);
  const user = useUser() as any;
  const insets = useSafeAreaInsets();

  const address = useMemo(
    () => (user?.walletAddress || user?.address || "").toLowerCase(),
    [user],
  );

  const [tips, setTips] = useState<TipRecord[]>([]);
  const [ppv, setPpv] = useState<PpvRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("1m");

  const load = useCallback(async (silent = false) => {
    if (!address) { setLoading(false); return; }
    if (!silent) setLoading(true);

    const [{ data: tipData }, { data: ppvData }] = await Promise.all([
      supabase
        .from("tip_records")
        .select("amount, created_at, sender_address, token_id")
        .eq("receiver_address", address)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("ppv_purchases")
        .select("amount, created_at, buyer_address, token_id")
        .eq("creator_address", address)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    setTips((tipData as TipRecord[]) || []);
    setPpv((ppvData as PpvRecord[]) || []);
    setLoading(false);
    setRefreshing(false);
  }, [address]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const filteredTips = useMemo(() => filterByTime(tips, timeFilter), [tips, timeFilter]);
  const filteredPpv = useMemo(() => filterByTime(ppv, timeFilter), [ppv, timeFilter]);

  const tipsTotal = useMemo(() => filteredTips.reduce((s, r) => s + Number(r.amount), 0), [filteredTips]);
  const ppvTotal = useMemo(() => filteredPpv.reduce((s, r) => s + Number(r.amount), 0), [filteredPpv]);
  const totalEarned = tipsTotal + ppvTotal;

  // Merge recent transactions
  const recentTx = useMemo(() => {
    const tx = [
      ...filteredTips.map((t) => ({
        type: "tip" as const,
        amount: Number(t.amount),
        from: t.sender_address,
        date: t.created_at,
        tokenId: t.token_id,
      })),
      ...filteredPpv.map((p) => ({
        type: "ppv" as const,
        amount: Number(p.amount),
        from: p.buyer_address,
        date: p.created_at,
        tokenId: p.token_id,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return tx.slice(0, 50);
  }, [filteredTips, filteredPpv]);

  return (
    <View style={{ flex: 1, backgroundColor: "#010305" }}>
      <ScreenHeader title={t("settings.categoryEarnings")} canGoBack />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#D4D4D8" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        >
          {/* Invite & earn */}
          <InviteFriendsCard address={address} shareName={user?.username} />

          {/* Time filter */}
          <View style={styles.filterRow}>
            {TIME_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setTimeFilter(f.key)}
                style={[styles.filterBtn, timeFilter === f.key && styles.filterBtnActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, timeFilter === f.key && styles.filterTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart + summary */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Income Breakdown</Text>
            <View style={styles.chartRow}>
              <PieChart tips={tipsTotal} ppv={ppvTotal} />
              <View style={{ flex: 1, gap: 12 }}>
                <View style={styles.legend}>
                  <View style={[styles.dot, { backgroundColor: SOURCE_COLORS.tips }]} />
                  <View>
                    <Text style={styles.legendLabel}>Tips</Text>
                    <Text style={styles.legendValue}>{fmtAmount(tipsTotal)} DHB</Text>
                  </View>
                </View>
                <View style={styles.legend}>
                  <View style={[styles.dot, { backgroundColor: SOURCE_COLORS.ppv }]} />
                  <View>
                    <Text style={styles.legendLabel}>PPV Sales</Text>
                    <Text style={styles.legendValue}>{fmtAmount(ppvTotal)} DHB</Text>
                  </View>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{fmtAmount(totalEarned)} DHB</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Icon name="Gem" size={18} color="#22C55E" />
              <Text style={styles.statNum}>{filteredTips.length}</Text>
              <Text style={styles.statLabel}>Tips received</Text>
            </View>
            <View style={styles.statBox}>
              <Icon name="Ticket" size={18} color="#D4D4D8" />
              <Text style={styles.statNum}>{filteredPpv.length}</Text>
              <Text style={styles.statLabel}>PPV unlocks</Text>
            </View>
          </View>

          {/* Earnings vs other platforms */}
          <EarningsComparisonCard />

          {/* Recent transactions */}
          {recentTx.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Transactions</Text>
              {recentTx.map((tx, i) => (
                <View key={i} style={[styles.txRow, i > 0 && styles.txBorder]}>
                  <View
                    style={[
                      styles.txIcon,
                      { backgroundColor: tx.type === "tip" ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.12)" },
                    ]}
                  >
                    <Icon
                      name={tx.type === "tip" ? "Gem" : "Ticket"}
                      size={14}
                      color={tx.type === "tip" ? SOURCE_COLORS.tips : SOURCE_COLORS.ppv}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txType}>{tx.type === "tip" ? "Tip received" : "PPV unlock"}</Text>
                    <Text style={styles.txFrom} numberOfLines={1}>
                      {tx.from.slice(0, 6)}…{tx.from.slice(-4)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.txAmount, { color: tx.type === "tip" ? SOURCE_COLORS.tips : SOURCE_COLORS.ppv }]}>
                      +{fmtAmount(tx.amount)} DHB
                    </Text>
                    <Text style={styles.txDate}>{fmtDate(tx.date)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {recentTx.length === 0 && !loading && (
            <View style={styles.center}>
              <Icon name="TrendingUp" size={48} color="#3F3F46" />
              <Text style={styles.emptyTitle}>No earnings yet</Text>
              <Text style={styles.emptySubtitle}>
                Tips and PPV sales will appear here
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  filterRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  filterBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
  filterBtnActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  filterText: { color: "#A6A9AC", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#F9FBFF" },
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { color: "#F9FBFF", fontSize: 15, fontWeight: "700", marginBottom: 14 },
  chartRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  legend: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: "#8B8D90", fontSize: 12 },
  legendValue: { color: "#F9FBFF", fontSize: 14, fontWeight: "600" },
  totalBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.07)", paddingTop: 8 },
  totalLabel: { color: "#A6A9AC", fontSize: 12 },
  totalValue: { color: "#D4D4D8", fontSize: 16, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  statNum: { color: "#F9FBFF", fontSize: 22, fontWeight: "700" },
  statLabel: { color: "#A6A9AC", fontSize: 12 },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  txBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.05)" },
  txIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  txType: { color: "#F9FBFF", fontSize: 13, fontWeight: "600" },
  txFrom: { color: "#A6A9AC", fontSize: 12, fontFamily: "monospace", marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: "700" },
  txDate: { color: "#A6A9AC", fontSize: 12, marginTop: 2 },
  emptyTitle: { color: "#F9FBFF", fontSize: 16, fontWeight: "600" },
  emptySubtitle: { color: "#A6A9AC", fontSize: 13, textAlign: "center" },
});

export default EarningsScreen;
