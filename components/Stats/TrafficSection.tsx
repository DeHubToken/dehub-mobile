/**
 * Site traffic, the app's half of web's Stats page traffic section.
 *
 * Reads the same public endpoint web does (dehub.io/api/stats, the Cloudflare
 * Worker that queries Cloudflare's analytics for the zone), so both show the
 * same edge-measured numbers. `ok: false` is a real answer (analytics not
 * configured) and renders as its own state; a failed request hides the
 * section rather than taking the member numbers below it down too.
 */
import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Svg, { Line, Polyline } from "react-native-svg";
import { PageSection } from "../page/PageKit";
import { getCountryFlag } from "../../libs/radio-browser";
import { summarizeTraffic, type SiteStatsBreakdownDay, type SiteStatsDay } from "../../libs/site-traffic";

const ENDPOINT = "https://dehub.io/api/stats";

type SiteStats =
  | { ok: true; daily: SiteStatsDay[]; breakdown: SiteStatsBreakdownDay[] }
  | { ok: false; reason: string; message?: string };

async function fetchSiteStats(): Promise<SiteStats> {
  const res = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
  const body = (await res.json()) as SiteStats;
  if (!body || typeof body !== "object" || !("ok" in body)) throw new Error("Unexpected stats response");
  return body;
}

const compact = (n: number) =>
  n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K` : `${(n / 1_000_000).toFixed(1)}M`;

function VisitorsChart({ rows }: { rows: SiteStatsDay[] }) {
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const w = Math.max(260, width - 48);
  const h = 150;
  if (rows.length < 2) return <Text style={styles.empty}>{t("stats.chart.empty")}</Text>;
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  const pts = rows.map((r, i) => `${(i / (rows.length - 1)) * w},${h - 8 - (r.visitors / max) * (h - 16)}`).join(" ");
  return (
    <View>
      <Svg width={w} height={h}>
        <Line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke="#383A3D" />
        <Polyline points={pts} fill="none" stroke="#F4F4F5" strokeWidth={2} />
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>{rows[0].date}</Text>
        <Text style={styles.chartLabel}>{rows[rows.length - 1].date}</Text>
      </View>
    </View>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function ShareRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? value / total : 0;
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareTop}>
        <Text style={styles.shareLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.shareValue}>{compact(value)}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, pct * 100)}%` }]} /></View>
    </View>
  );
}

export default function TrafficSection({ days }: { days: number | null }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["site-stats"], queryFn: fetchSiteStats, staleTime: 45_000, refetchInterval: 60_000, retry: 1 });
  const data = query.data;
  const view = useMemo(() => (data?.ok ? summarizeTraffic(data.daily, data.breakdown, days) : null), [data, days]);

  if (query.isError || !data) return null;
  if (!data.ok || !view) {
    return (
      <PageSection title={t("stats.definitions.visitorsTerm")}>
        <Text style={styles.metricHint}>{t("stats.unavailable.title")}</Text>
      </PageSection>
    );
  }

  const countryTotal = view.countries.reduce((s, [, v]) => s + v, 0);
  const browserTotal = view.browsers.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <PageSection title={t("stats.definitions.visitorsTerm")}>
        <View style={styles.grid}>
          <Tile label={t("stats.tile.visitorsToday")} value={compact(view.today)} hint={t("stats.tile.soFarToday")} />
          <Tile label={t("stats.tile.pageViews")} value={compact(view.pageViews)} hint={t("stats.tile.inRange")} />
          <Tile label={t("stats.tile.requestsLabel")} value={compact(view.requests)} hint={t("stats.tile.inRange")} />
        </View>
      </PageSection>
      <PageSection title={t("stats.chart.daily")} action={<Text style={styles.metricHint}>{t("stats.chart.dailyHint")}</Text>}>
        <VisitorsChart rows={view.rows} />
      </PageSection>
      {view.countries.length > 0 && (
        <PageSection title={t("stats.countries.title")} action={<Text style={styles.metricHint}>{t("stats.countries.window", { days: view.breakdownDays })}</Text>}>
          {view.countries.map(([code, n]) => (
            <ShareRow key={code} label={`${getCountryFlag(code)}  ${code}`} value={n} total={countryTotal} />
          ))}
        </PageSection>
      )}
      {view.browsers.length > 0 && (
        <PageSection title={t("stats.browsers.title")} action={<Text style={styles.metricHint}>{t("stats.browsers.window")}</Text>}>
          {view.browsers.map(([name, n]) => (
            <ShareRow key={name} label={name} value={n} total={browserTotal} />
          ))}
        </PageSection>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minWidth: 96, backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderRadius: 10, padding: 12 },
  metricLabel: { color: "#8B8D90", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginTop: 3 },
  metricHint: { color: "#8B8D90", fontSize: 11, marginTop: 3 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 },
  chartLabel: { color: "#6F7174", fontSize: 10 },
  empty: { color: "#8B8D90", textAlign: "center", paddingVertical: 40 },
  shareRow: { marginBottom: 10 },
  shareTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  shareLabel: { color: "#E4E4E7", fontSize: 13, flex: 1 },
  shareValue: { color: "#A1A1AA", fontSize: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: "#F4F4F5" },
});
