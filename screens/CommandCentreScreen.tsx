/**
 * CommandCentreScreen
 * ===================
 * Native port of the web CommandCentrePage (/app/command-centre) — the same six
 * Overview cards, in the same order: Balance, Income, Engagement, Recent
 * activity, Subscriptions, Stats.
 *
 * Reuses what already existed on mobile rather than duplicating it:
 *   - ProfileAssets    for the token balance rows
 *   - getMyAnalytics   the same endpoint web's EngagementChart uses
 *   - subscription.service / dpay.service for subs and the DHB ledger
 *
 * See hooks/useCommandCentre.ts for the one deliberate data difference (no
 * on-chain transfer index on mobile).
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import Svg, { Circle, Polyline, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import ProfileAssets from "../components/Profile/ProfileAssets";
import { theme } from "../theme";
import { formatCompactNumber } from "../libs";
import { useUser, useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { getMyAnalytics, type AnalyticsResponse } from "../services/nft.service";
import { ScreenNames } from "../navigation/ScreenNames";
import {
  useTipsReceived,
  usePpvSales,
  useRecentActivity,
  useSubscriptionsSummary,
  rangeStart,
  INCOME_SOURCES,
  type IncomeRange,
  type ActivityItem,
} from "../hooks/useCommandCentre";

const INCOME_RANGES: IncomeRange[] = ["1h", "1d", "1w", "1m", "Max"];
type EngRange = "7d" | "30d" | "90d";
const ENG_RANGES: EngRange[] = ["7d", "30d", "90d"];

const fmt = (n: number) => formatCompactNumber(Math.round(n));

function timeAgo(iso: string, t: TFunction): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("commandCentre.time.justNow");
  const m = Math.floor(s / 60);
  if (m < 60) return t("commandCentre.time.minutes", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("commandCentre.time.hours", { count: h });
  const d = Math.floor(h / 24);
  if (d < 30) return t("commandCentre.time.days", { count: d });
  return t("commandCentre.time.months", { count: Math.floor(d / 30) });
}

const Card: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const RangeRow: React.FC<{
  items: readonly string[];
  active: string;
  onSelect: (v: any) => void;
}> = ({ items, active, onSelect }) => (
  <View style={styles.rangeRow}>
    {items.map((r) => (
      <Pressable
        key={r}
        onPress={() => onSelect(r)}
        hitSlop={{ top: 10, bottom: 10 }}
        style={[styles.rangeChip, active === r && styles.rangeChipActive]}
      >
        <Text style={[styles.rangeText, active === r && styles.rangeTextActive]}>{r}</Text>
      </Pressable>
    ))}
  </View>
);

// ── Income donut ────────────────────────────────────────────────────────────

/**
 * Donut built from stroke-dasharray arcs on concentric circles — react-native-svg
 * has no chart lib, and this matches web's recharts Pie (inner 45 / outer 70)
 * closely enough at mobile size.
 */
const IncomeDonut: React.FC<{ slices: { value: number; color: string }[] }> = ({ slices }) => {
  const SIZE = 148;
  const R = 52;
  const STROKE = 22;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <Svg width={SIZE} height={SIZE}>
      {slices.map((s, i) => {
        const len = (s.value / 100) * C;
        const el = (
          <Circle
            key={i}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={s.color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}`}
            strokeDashoffset={-offset}
            // Start at 12 o'clock like recharts, not 3 o'clock.
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        );
        offset += len;
        return el;
      })}
    </Svg>
  );
};

// ── Engagement line chart ───────────────────────────────────────────────────

function buildPoints(data: number[], w: number, h: number, pad: number) {
  if (!data.length) return "";
  const max = Math.max(...data, 1);
  return data
    .map((v, i) => {
      const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
      const y = pad + (1 - v / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const EngagementChart: React.FC<{ data?: AnalyticsResponse }> = ({ data }) => {
  const { t } = useTranslation();
  const W = 320;
  const H = 130;
  const PAD = 10;

  const merged = useMemo(() => {
    if (!data) return [] as { date: string; likes: number; followers: number }[];
    const map = new Map<string, { date: string; likes: number; followers: number }>();
    (data.likesOverTime ?? []).forEach(({ date, count }) =>
      map.set(date, { date, likes: count, followers: 0 }),
    );
    (data.followersOverTime ?? []).forEach(({ date, count }) => {
      const e = map.get(date);
      if (e) e.followers = count;
      else map.set(date, { date, likes: 0, followers: count });
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  if (merged.length === 0) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.dim}>{t("commandCentre.noDataInPeriod")}</Text>
      </View>
    );
  }

  const labels = merged.map((m) => m.date);
  const likesPts = buildPoints(merged.map((m) => m.likes), W, H, PAD);
  const followersPts = buildPoints(merged.map((m) => m.followers), W, H, PAD);
  const ticks =
    labels.length <= 7
      ? labels.map((_, i) => i)
      : [0, Math.floor(labels.length / 3), Math.floor((2 * labels.length) / 3), labels.length - 1];

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <SvgLine x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#3f3f46" strokeWidth="1" />
      {ticks.map((idx) => {
        const x = PAD + (idx / Math.max(labels.length - 1, 1)) * (W - PAD * 2);
        const p = (labels[idx] ?? "").split("-");
        const short = p.length === 3 ? `${parseInt(p[1])}/${parseInt(p[2])}` : labels[idx];
        return (
          <SvgText key={idx} x={x} y={H - 1} fontSize={12} fill="#A1A1AA" textAnchor="middle">
            {short}
          </SvgText>
        );
      })}
      {!!likesPts && (
        <Polyline points={likesPts} fill="none" stroke="#F4F4F5" strokeWidth="2" strokeLinejoin="round" />
      )}
      {!!followersPts && (
        <Polyline points={followersPts} fill="none" stroke="#F4F4F5" strokeWidth="2" strokeLinejoin="round" />
      )}
    </Svg>
  );
};

// ── Activity row ────────────────────────────────────────────────────────────

const ACTIVITY_META: Record<string, { icon: any; labelKey: string }> = {
  "tip-in": { icon: "ArrowDownLeft", labelKey: "tipReceived" },
  "tip-out": { icon: "ArrowUpRight", labelKey: "tipSent" },
  "ppv-in": { icon: "ArrowDownLeft", labelKey: "ppvSale" },
  "ppv-out": { icon: "ArrowUpRight", labelKey: "ppvPurchase" },
  dpay: { icon: "CreditCard", labelKey: "dhbPurchase" },
};

const ActivityRow: React.FC<{ item: ActivityItem }> = ({ item }) => {
  const { t } = useTranslation();
  const meta = ACTIVITY_META[item.kind];
  const positive = item.amount >= 0;
  return (
    <View style={styles.activityRow}>
      <View style={styles.activityIcon}>
        <Icon name={meta?.icon ?? "Circle"} size={14} color={positive ? "#F4F4F5" : "#8B8D90"} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.activityLabel}>
          {meta ? t(`commandCentre.activity.${meta.labelKey}`) : item.kind}
        </Text>
        <Text style={styles.activityTime}>{timeAgo(item.createdAt, t)}</Text>
      </View>
      <Text style={[styles.activityAmount, { color: positive ? "#F4F4F5" : "#8B8D90" }]}>
        {positive ? "+" : ""}
        {fmt(item.amount)} {item.currency}
      </Text>
    </View>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────

export default function CommandCentreScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useUser() as any;
  const { isSignedIn, needsUsername } = useAuthState();
  useGateToHome(isSignedIn && !needsUsername);

  const wallet: string | null = user?.walletAddress || user?.address || null;
  const [incomeRange, setIncomeRange] = useState<IncomeRange>("1m");
  const [engRange, setEngRange] = useState<EngRange>("30d");

  const tips = useTipsReceived();
  const ppv = usePpvSales();
  const activity = useRecentActivity();
  const subs = useSubscriptionsSummary();

  const analytics = useQuery({
    queryKey: ["cc-analytics", wallet, engRange],
    queryFn: () => getMyAnalytics(engRange),
    enabled: !!wallet,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Same maths as web's IncomeChart: filter by range, total per source, then
  // percentages. Subs / ad revenue / bounties have no source yet — 0, as on web.
  const { slices, totalEarned } = useMemo(() => {
    const start = rangeStart(incomeRange);
    const inRange = (d: string) => !start || new Date(d) >= start;

    let tipsTotal = 0;
    (tips.data ?? []).forEach((r) => {
      if (inRange(r.created_at)) tipsTotal += Number(r.amount) || 0;
    });
    let ppvTotal = 0;
    (ppv.data ?? []).forEach((r) => {
      if (inRange(r.created_at)) ppvTotal += Number(r.amount) || 0;
    });

    const totals: Record<string, number> = {
      tips: Math.round(tipsTotal * 100) / 100,
      subs: 0,
      adRevenue: 0,
      bounties: 0,
      ppv: Math.round(ppvTotal * 100) / 100,
    };
    const total = Object.values(totals).reduce((a, b) => a + b, 0);

    return {
      totalEarned: Math.round(total * 100) / 100,
      slices: INCOME_SOURCES.filter((s) => totals[s.key] > 0).map((s) => ({
        label: t(`commandCentre.incomeSources.${s.key}`, { defaultValue: s.label }),
        color: s.color,
        raw: totals[s.key],
        value: total > 0 ? Math.round((totals[s.key] / total) * 1000) / 10 : 0,
      })),
    };
  }, [tips.data, ppv.data, incomeRange, t]);

  const incomeLoading = tips.isLoading || ppv.isLoading;

  const onRefresh = useCallback(() => {
    void tips.refetch();
    void ppv.refetch();
    void activity.refetch();
    void analytics.refetch();
    subs.refetch();
  }, [tips, ppv, activity, analytics, subs]);

  const refreshing =
    tips.isRefetching || ppv.isRefetching || activity.isRefetching || analytics.isRefetching;

  const stats = [
    { label: t("commandCentre.followers"), value: fmt(user?.followers ?? 0) },
    { label: t("commandCentre.following"), value: fmt(user?.followings ?? 0) },
    { label: t("commandCentre.tipsIn"), value: fmt(user?.receivedTips ?? 0) },
    { label: t("commandCentre.tipsOut"), value: fmt(user?.sentTips ?? 0) },
  ];

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={t("commandCentre.title")}
        subtitle={t("commandCentre.mobileSubtitle")}
        canGoBack
        rightContent={<Icon name="LayoutDashboard" size={22} color={theme.colors.accent} />}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
      >
        {/* Balance */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t("commandCentre.balance")}</Text>
            <Pressable
              onPress={() => navigation.navigate(ScreenNames.Dpay, { initialTab: "buy" })}
              style={styles.walletBtn}
            >
              <Icon name="Wallet" size={15} color="#000000" />
              <Text style={styles.walletBtnText}>{t("commandCentre.fullWallet")}</Text>
            </Pressable>
          </View>
          <Text style={styles.balanceBig}>
            {fmt(user?.badgeBalance ?? user?.balance ?? 0)}
            <Text style={styles.balanceUnit}> DHB</Text>
          </Text>
          <ProfileAssets />
        </Card>

        {/* Income */}
        <Card>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t("commandCentre.income")}</Text>
              {totalEarned > 0 && (
                <Text style={styles.incomeTotal}>{totalEarned.toLocaleString()} DHB</Text>
              )}
            </View>
          </View>
          <RangeRow items={INCOME_RANGES} active={incomeRange} onSelect={setIncomeRange} />

          {incomeLoading ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 32 }} />
          ) : slices.length === 0 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.dim}>{t("commandCentre.noIncomeInPeriod")}</Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", marginTop: 12 }}>
              <IncomeDonut slices={slices} />
              <View style={styles.legend}>
                {slices.map((s) => (
                  <View key={s.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                    <Text style={styles.legendText}>
                      <Text style={{ color: s.color, fontWeight: "700" }}>{s.value}%</Text> {s.label}
                      <Text style={styles.dim}> ({s.raw.toLocaleString()})</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Engagement */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t("commandCentre.engagement")}</Text>
          </View>
          <RangeRow items={ENG_RANGES} active={engRange} onSelect={setEngRange} />
          {analytics.isLoading ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 32 }} />
          ) : (
            <View style={{ marginTop: 10 }}>
              <EngagementChart data={analytics.data} />
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "rgba(255,255,255,0.15)" }]} />
                  <Text style={styles.legendText}>{t("commandCentre.likes")}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: "#F4F4F5" }]} />
                  <Text style={styles.legendText}>{t("commandCentre.newFollowers")}</Text>
                </View>
              </View>
              {!!analytics.data && (
                <View style={styles.totalsRow}>
                  {[
                    { label: t("commandCentre.totalLikes"), value: analytics.data.totals?.likes ?? 0 },
                    { label: t("commandCentre.followers"), value: analytics.data.totals?.followers ?? 0 },
                    { label: t("commandCentre.uploads"), value: analytics.data.totals?.uploads ?? 0 },
                  ].map((s) => (
                    <View key={s.label} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={styles.totalsValue}>{fmt(s.value)}</Text>
                      <Text style={styles.totalsLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </Card>

        {/* Recent activity */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t("commandCentre.recentActivity")}</Text>
          </View>
          {activity.isLoading ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 24 }} />
          ) : (activity.data ?? []).length === 0 ? (
            <Text style={[styles.dim, { paddingVertical: 18, textAlign: "center" }]}>
              {t("commandCentre.noTransactionsYet")}
            </Text>
          ) : (
            (activity.data ?? []).slice(0, 12).map((a) => <ActivityRow key={a.id} item={a} />)
          )}
        </Card>

        {/* Subscriptions */}
        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t("commandCentre.subscriptions")}</Text>
          </View>
          {subs.isLoading ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={styles.statGrid}>
                {[
                  { label: t("commandCentre.active"), value: subs.activeCount },
                  { label: t("commandCentre.total"), value: subs.total },
                  { label: t("commandCentre.plansLabel"), value: subs.planCount },
                ].map((s) => (
                  <View key={s.label} style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>{s.label}</Text>
                    <Text style={styles.statBoxValue}>{s.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.spendBox}>
                <Text style={styles.dim}>{t("commandCentre.estMonthlySpend")}</Text>
                <Text style={styles.spendValue}>
                  {Math.round(subs.monthlySpend).toLocaleString()} DHB
                </Text>
              </View>
            </>
          )}
        </Card>

        {/* Stats */}
        <Card style={{ paddingVertical: 12 }}>
          <View style={{ flexDirection: "row" }}>
            {stats.map((s, i) => (
              <View
                key={s.label}
                style={[styles.statCell, i > 0 && styles.statCellDivider]}
              >
                <Text style={styles.statCellValue}>{s.value}</Text>
                <Text style={styles.statCellLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },

  card: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 16,
  },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  cardTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  dim: { color: "#A1A1AA", fontSize: 12 },

  walletBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  walletBtnText: { color: "#000000", fontSize: 12, fontWeight: "700" },

  balanceBig: { color: "#FFFFFF", fontSize: 32, fontWeight: "800", marginTop: 6 },
  balanceUnit: { color: "#71717A", fontSize: 15, fontWeight: "700" },

  incomeTotal: { color: "#F4F4F5", fontSize: 13, fontWeight: "700", marginTop: 2 },

  rangeRow: { flexDirection: "row", gap: 6, marginTop: 10 },
  rangeChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rangeChipActive: { backgroundColor: "#FFFFFF" },
  rangeText: { color: "#A1A1AA", fontSize: 12, fontWeight: "700" },
  rangeTextActive: { color: "#000000" },

  chartEmpty: { height: 120, alignItems: "center", justifyContent: "center" },

  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 999 },
  legendText: { color: "#D4D4D8", fontSize: 12 },

  totalsRow: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  totalsValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  totalsLabel: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },

  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  activityIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  activityLabel: { color: "#E4E4E7", fontSize: 13, fontWeight: "600" },
  activityTime: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
  activityAmount: { fontSize: 13, fontWeight: "700" },

  statGrid: { flexDirection: "row", gap: 8, marginTop: 12 },
  statBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 11,
  },
  statBoxLabel: { color: "#71717A", fontSize: 11 },
  statBoxValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "700", marginTop: 3 },
  spendBox: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 13,
  },
  spendValue: { color: "#FFFFFF", fontSize: 21, fontWeight: "800", marginTop: 4 },

  statCell: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  statCellDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.07)" },
  statCellValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  statCellLabel: { color: "#A1A1AA", fontSize: 12, marginTop: 2 },
});
