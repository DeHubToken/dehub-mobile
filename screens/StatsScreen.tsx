import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import ScreenHeader from "../components/ScreenHeader";

type Range = "7d" | "30d" | "1y" | "all";

interface HistoryDay {
  date: string;
  newUsers: number;
  total: number;
}

interface UserStats {
  ok: true;
  totals: { total: number };
  active: { daily: number; weekly: number; monthly: number };
  newUsers: { today: number; thisWeek: number; thisMonth: number; thisYear: number; allTime: number };
  history: { since: string | null; days: HistoryDay[] };
}

const RANGE_OPTIONS: { key: Range; label: string; days: number | null }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: null },
];

const ENDPOINT = "https://api.dehub.io/api/stats/users";

const formatCount = (value: number) => value.toLocaleString();

async function fetchStats(): Promise<UserStats> {
  const response = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Stats request failed (${response.status})`);
  const body = (await response.json()) as UserStats;
  if (!body || body.ok !== true) throw new Error("Stats response was not recognised");
  return body;
}

function MembersChart({ rows }: { rows: HistoryDay[] }) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(260, width - 56);
  const chartHeight = 168;
  const sampled = useMemo(() => {
    if (rows.length <= 180) return rows;
    const step = Math.ceil(rows.length / 180);
    const points = rows.filter((_, index) => index % step === 0);
    if (points[points.length - 1] !== rows[rows.length - 1]) points.push(rows[rows.length - 1]);
    return points;
  }, [rows]);

  if (sampled.length < 2) return <Text style={styles.empty}>Not enough history for a chart yet</Text>;

  const values = sampled.map((row) => row.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = sampled
    .map((row, index) => {
      const x = (index / (sampled.length - 1)) * chartWidth;
      const y = chartHeight - 10 - ((row.total - min) / span) * (chartHeight - 20);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <View>
      <Svg width={chartWidth} height={chartHeight} accessibilityLabel="Members over time chart">
        <Line x1="0" y1={chartHeight - 1} x2={chartWidth} y2={chartHeight - 1} stroke="#383A3D" />
        <Polyline points={points} fill="none" stroke="#F4F4F5" strokeWidth={2.5} />
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>{sampled[0].date}</Text>
        <Text style={styles.chartLabel}>{sampled[sampled.length - 1].date}</Text>
      </View>
    </View>
  );
}

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{formatCount(value)}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

export default function StatsScreen() {
  const [range, setRange] = useState<Range>("30d");
  const query = useQuery({
    queryKey: ["public-user-stats"],
    queryFn: fetchStats,
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const option = RANGE_OPTIONS.find((item) => item.key === range)!;
  const rows = useMemo(() => {
    const all = query.data?.history.days ?? [];
    return option.days == null ? all : all.slice(-option.days);
  }, [option.days, query.data]);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Stats" subtitle="Live community numbers" />
      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#F4F4F5" /></View>
      ) : query.isError || !query.data ? (
        <View style={styles.center}>
          <Text style={styles.error}>Could not load live stats.</Text>
          <Pressable style={styles.retry} onPress={() => query.refetch()}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} tintColor="#F4F4F5" />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {RANGE_OPTIONS.map((item) => (
              <Pressable key={item.key} onPress={() => setRange(item.key)} style={[styles.filter, range === item.key && styles.filterActive]}>
                <Text style={[styles.filterText, range === item.key && styles.filterTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Metric label="Members" value={query.data.totals.total} hint="Live platform total" />
          <Text style={styles.sectionTitle}>Active registered users</Text>
          <View style={styles.grid}>
            <Metric label="Today" value={query.data.active.daily} />
            <Metric label="7 days" value={query.data.active.weekly} />
            <Metric label="30 days" value={query.data.active.monthly} />
          </View>
          <Text style={styles.sectionTitle}>New members</Text>
          <View style={styles.grid}>
            <Metric label="Today" value={query.data.newUsers.today} />
            <Metric label="This month" value={query.data.newUsers.thisMonth} />
            <Metric label="This year" value={query.data.newUsers.thisYear} />
          </View>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Members over time</Text>
              <Text style={styles.cardHint}>{option.days == null ? "All time" : `Last ${rows.length} days`}</Text>
            </View>
            <MembersChart rows={rows} />
            <Text style={styles.source}>Recorded account history from DeHub’s public stats endpoint. No estimated values are used in this chart.</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  content: { padding: 12, paddingBottom: 40, gap: 12 },
  filters: { gap: 8, paddingVertical: 2 },
  filter: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: "#383A3D", backgroundColor: "#1C1C1C" },
  filterActive: { backgroundColor: "#F4F4F5", borderColor: "#F4F4F5" },
  filterText: { color: "#A6A9AC", fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: "#09090B" },
  metric: { flex: 1, minWidth: 96, backgroundColor: "#1C1C1C", borderColor: "#333333", borderWidth: 1, borderRadius: 16, padding: 14 },
  metricLabel: { color: "#8B8D90", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", marginTop: 3 },
  metricHint: { color: "#8B8D90", fontSize: 11, marginTop: 3 },
  sectionTitle: { color: "#F4F4F5", fontSize: 14, fontWeight: "700", marginTop: 4 },
  grid: { flexDirection: "row", gap: 8 },
  card: { backgroundColor: "#1C1C1C", borderColor: "#333333", borderWidth: 1, borderRadius: 16, padding: 14, overflow: "hidden" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  cardTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  cardHint: { color: "#8B8D90", fontSize: 11 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 },
  chartLabel: { color: "#6F7174", fontSize: 10 },
  source: { color: "#8B8D90", fontSize: 11, lineHeight: 16, marginTop: 14 },
  empty: { color: "#8B8D90", textAlign: "center", paddingVertical: 60 },
  error: { color: "#A6A9AC", fontSize: 14 },
  retry: { backgroundColor: "#F4F4F5", borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: "#09090B", fontWeight: "700" },
});
