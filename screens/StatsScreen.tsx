import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { DeHubRefreshControl, DeHubRefreshMark } from "../components/Feed/DeHubRefreshControl";
import Svg, { Line, Polyline } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { KitButton, PageEmpty, PageSection, PageTabs } from "../components/page/PageKit";
import FeedbackSection from "../components/Stats/FeedbackSection";
import { useKeyboardOffset } from "../hooks/useKeyboardLayout";
import Icon from "../components/ui/Icon";
import { ScreenNames } from "../navigation/ScreenNames";

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

const RANGE_OPTIONS: { key: Range; labelKey: string; days: number | null }[] = [
  { key: "7d", labelKey: "stats.range7d", days: 7 },
  { key: "30d", labelKey: "stats.range30d", days: 30 },
  { key: "1y", labelKey: "stats.range1y", days: 365 },
  { key: "all", labelKey: "leaderboard.allTime", days: null },
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
  // Section inset: 8pt margin + 16pt padding a side on the canvas themes.
  const chartWidth = Math.max(260, width - 48);
  const { t } = useTranslation();
  const chartHeight = 168;
  const sampled = useMemo(() => {
    if (rows.length <= 180) return rows;
    const step = Math.ceil(rows.length / 180);
    const points = rows.filter((_, index) => index % step === 0);
    if (points[points.length - 1] !== rows[rows.length - 1]) points.push(rows[rows.length - 1]);
    return points;
  }, [rows]);

  if (sampled.length < 2) return <Text style={styles.empty}>{t("stats.notEnoughHistory")}</Text>;

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
      <Svg width={chartWidth} height={chartHeight} accessibilityLabel={t("stats.chartA11y")}>
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
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  // The KeyboardAvoidingView is the screen root and wraps the ScreenHeader, so
  // only the root SafeAreaView's inset sits above it. Adding the header height
  // would count it twice.
  const keyboardOffset = useKeyboardOffset();
  const option = RANGE_OPTIONS.find((item) => item.key === range)!;
  const rows = useMemo(() => {
    const all = query.data?.history.days ?? [];
    return option.days == null ? all : all.slice(-option.days);
  }, [option.days, query.data]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
      <ScreenHeader title={t("nav.stats")} subtitle={t("stats.subtitle")} icon="stats" />
      {query.isLoading ? (
        <View style={styles.center}><ActivityIndicator color="#F4F4F5" /></View>
      ) : query.isError || !query.data ? (
        <PageEmpty
          icon="stats"
          title={t("stats.loadFailed")}
          action={<KitButton label={t("common.tryAgain")} onPress={() => query.refetch()} />}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<DeHubRefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} tintColor="#F4F4F5" />}
        >
          <PageTabs
            value={range}
            onChange={setRange}
            tabs={RANGE_OPTIONS.map((item) => ({ id: item.key, label: t(item.labelKey) }))}
            style={{ paddingBottom: 10 }}
          />

          <PageSection>
            <Metric label={t("communities.membersLabel")} value={query.data.totals.total} hint={t("stats.livePlatformTotal")} />
          </PageSection>
          <PageSection title={t("stats.activeUsers")}>
            <View style={styles.grid}>
              <Metric label={t("explorePage.today")} value={query.data.active.daily} />
              <Metric label={t("stats.range7d")} value={query.data.active.weekly} />
              <Metric label={t("stats.range30d")} value={query.data.active.monthly} />
            </View>
          </PageSection>
          <PageSection>
            {/* The heading opens the New members rail on Explore, which is
                otherwise only found by scrolling that tab. Explore is a bottom
                tab, so the route goes through Root; `pop` returns to the Root
                already under this page instead of stacking a second one. */}
            <Pressable
              onPress={() => navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Explore, params: { section: "newMembers" } }, { pop: true })}
              accessibilityRole="link"
              accessibilityLabel={t("stats.community.openNewMembers")}
              hitSlop={8}
              style={({ pressed }) => [styles.sectionLink, pressed && styles.sectionLinkPressed]}
            >
              <Text style={styles.sectionTitle}>{t("stats.newMembers")}</Text>
              <Icon name="ChevronRight" size={14} color="#A1A1AA" />
            </Pressable>
            <View style={styles.grid}>
              <Metric label={t("explorePage.today")} value={query.data.newUsers.today} />
              <Metric label={t("explorePage.thisMonth")} value={query.data.newUsers.thisMonth} />
              <Metric label={t("explorePage.thisYear")} value={query.data.newUsers.thisYear} />
            </View>
          </PageSection>
          <PageSection
            title={t("stats.membersOverTime")}
            action={<Text style={styles.cardHint}>{option.days == null ? t("leaderboard.allTime") : t("stats.lastDays", { count: rows.length })}</Text>}
          >
            <MembersChart rows={rows} />
            <Text style={styles.source}>{t("stats.source")}</Text>
          </PageSection>

          <FeedbackSection />
        </ScrollView>
      )}
      <DeHubRefreshMark refreshing={query.isFetching} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#010305" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  content: { paddingTop: 4, paddingBottom: 40 },
  metric: { flex: 1, minWidth: 96, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderRadius: 10, padding: 12 },
  metricLabel: { color: "#8B8D90", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", marginTop: 3 },
  metricHint: { color: "#8B8D90", fontSize: 11, marginTop: 3 },
  sectionTitle: { color: "#F4F4F5", fontSize: 15, fontWeight: "600" },
  sectionLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2, marginBottom: 12 },
  sectionLinkPressed: { opacity: 0.6 },
  grid: { flexDirection: "row", gap: 8 },
  cardHint: { color: "#8B8D90", fontSize: 11 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 },
  chartLabel: { color: "#6F7174", fontSize: 10 },
  source: { color: "#8B8D90", fontSize: 11, lineHeight: 16, marginTop: 14 },
  empty: { color: "#8B8D90", textAlign: "center", paddingVertical: 60 },
});
