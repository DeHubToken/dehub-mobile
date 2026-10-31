/**
 * Small pieces shared by the post stats sheet and the Post Info stats card.
 * Written in the app's dark greys; System Light's colour pass (libs/jsx/tone)
 * flips them, the same as the rest of Post Info.
 */
import React, { useId } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { useTranslation } from "react-i18next";
import BadgeArtwork from "../../common/BadgeArtwork";
import { badgeImage } from "../../../libs/misc";
import { formatCompactNumber } from "../../../libs/numbers.util";
import { useAppTheme } from "../../../context/ThemeContext";
import type { PostStatsBadge } from "../../../services/post-stats.service";

export const fmt = (n: number | null | undefined) => formatCompactNumber(Math.max(0, Math.round(n ?? 0)));

export function fmtDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** "2.3× usual" against the creator's average post. */
export function VsUsual({ value, usual }: { value: number; usual: number | null | undefined }) {
  const { t } = useTranslation();
  if (usual == null || usual <= 0) return null;
  const ratio = value / usual;
  if (ratio >= 0.9 && ratio <= 1.1) return <Text style={s.sub}>{t("postStats.aboutUsual")}</Text>;
  const up = ratio > 1;
  return (
    <Text style={[s.sub, { color: up ? "#34D399" : "#F87171", fontWeight: "600" }]}>
      {up ? "▲" : "▼"} {t("postStats.timesUsual", { ratio: ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1) })}
    </Text>
  );
}

export function StatTile({ label, value, sub, style }: { label: string; value: React.ReactNode; sub?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.tile, style]}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={s.tileValue} numberOfLines={1}>{value}</Text>
      {sub ? (typeof sub === "string" ? <Text style={s.sub}>{sub}</Text> : sub) : null}
    </View>
  );
}

/** Same card as PostInfoScreen's Section. */
export function StatsCard({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        {aside ? <Text style={s.cardAside}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Rows of tiles, `cols` to a row. */
export function TileGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((item, j) => <View key={j} style={{ flex: 1, minWidth: 0 }}>{item}</View>)}
          {row.length < cols ? Array.from({ length: cols - row.length }, (_, k) => <View key={`f${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

/** Two-part bar: first share solid, rest faint, labels under it. */
export function SplitBar({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const total = left + right;
  const pct = total ? Math.round((left / total) * 100) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` }]} />
      </View>
      <View style={s.splitLabels}>
        <Text style={s.muted}><Text style={s.strong}>{fmt(left)}</Text> {leftLabel}</Text>
        <Text style={s.muted}><Text style={s.strong}>{fmt(right)}</Text> {rightLabel}</Text>
      </View>
    </View>
  );
}

/**
 * One or two series as an area chart. The second is stacked on the first and
 * drawn fainter, so members + signed out read as one total.
 */
export function AreaChart({ series, height = 72, marker }: { series: number[][]; height?: number; marker?: number | null }) {
  const gradId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const n = Math.max(0, ...series.map((x) => x.length));
  if (!n) return null;
  const stacked = series.map((_, i) =>
    Array.from({ length: n }, (_, x) => series.slice(0, i + 1).reduce((sum, row) => sum + (row[x] ?? 0), 0)),
  );
  const top = stacked[stacked.length - 1];
  const max = Math.max(1, ...top);
  const w = 300;
  const pad = 3;
  const X = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v: number) => pad + (height - pad * 2) * (1 - v / max);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const area = (upper: number[], lower: number[] | null) =>
    `${line(upper)} ${lower ? lower.map((_, i) => { const j = lower.length - 1 - i; return `L${X(j).toFixed(1)} ${Y(lower[j]).toFixed(1)}`; }).join(" ") : `L${w} ${height} L0 ${height}`} Z`;
  const peak = top.indexOf(max);
  const ink = "#FFFFFF";
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor={ink} stopOpacity={0.35} />
          <Stop offset="1" stopColor={ink} stopOpacity={0.05} />
        </LinearGradient>
      </Defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <Line key={f} x1={0} x2={w} y1={pad + (height - pad * 2) * f} y2={pad + (height - pad * 2) * f} stroke={ink} strokeOpacity={0.1} strokeWidth={1} />
      ))}
      {stacked.map((upper, i) => (
        <Path key={`a${i}`} d={area(upper, i ? stacked[i - 1] : null)} fill={i ? ink : `url(#${gradId})`} fillOpacity={i ? 0.12 : 1} />
      ))}
      {stacked.map((upper, i) => (
        <Path key={`l${i}`} d={line(upper)} fill="none" stroke={ink} strokeOpacity={i ? 0.45 : 1} strokeWidth={1.8} strokeDasharray={i ? "3 3" : undefined} strokeLinejoin="round" />
      ))}
      {marker != null && marker >= 0 && marker < n ? (
        <Line x1={X(marker)} x2={X(marker)} y1={0} y2={height} stroke={ink} strokeOpacity={0.6} strokeDasharray="2 3" strokeWidth={1} />
      ) : null}
      <Circle cx={X(peak)} cy={Y(max)} r={3} fill={ink} />
    </Svg>
  );
}

export function ChartLegend({ items }: { items: { label: string; faint?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 12, height: 2, borderRadius: 1, backgroundColor: "#FFFFFF", opacity: it.faint ? 0.4 : 1 }} />
          <Text style={s.legend}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Who saw the post, by the badge they held when they first saw it. No badge
 * and signed out close the list, so the rows add up to everyone it reached.
 */
export function BadgeBreakdown({ badges, signedOut, limit }: { badges: PostStatsBadge[]; signedOut: number; limit?: number }) {
  const { t } = useTranslation();
  const { isLight } = useAppTheme();
  const withBadge = badges.filter((b) => b.tier >= 0);
  const noBadge = badges.find((b) => b.tier < 0)?.people ?? 0;
  const shown = limit ? withBadge.slice(0, limit) : withBadge;
  const folded = limit ? withBadge.slice(limit).reduce((sum, b) => sum + b.people, 0) : 0;
  const rows = [
    ...shown.map((b) => ({ key: `t${b.tier}`, name: b.name ?? "", image: badgeImage(b.name, isLight ? "light" : "dark"), people: b.people })),
    ...(folded ? [{ key: "other", name: t("postStats.otherBadges"), image: undefined, people: folded }] : []),
    ...(noBadge ? [{ key: "none", name: t("postStats.noBadge"), image: undefined, people: noBadge }] : []),
    ...(signedOut ? [{ key: "out", name: t("postStats.signedOutViewers"), image: undefined, people: signedOut }] : []),
  ];
  if (!rows.length) return <Text style={s.muted}>{t("postStats.noViewersYet")}</Text>;
  const max = Math.max(1, ...rows.map((r) => r.people));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <View key={r.key} style={s.badgeRow}>
          {r.image ? <BadgeArtwork source={r.image} style={{ width: 22, height: 22 }} /> : <View style={s.badgeBlank} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.badgeName} numberOfLines={1}>{r.name}</Text>
            <View style={[s.track, { height: 6, marginTop: 4 }]}>
              <View style={[s.fill, { width: `${Math.max(3, (r.people / max) * 100)}%`, opacity: r.key === "out" ? 0.45 : 1 }]} />
            </View>
          </View>
          <Text style={s.badgeCount}>{fmt(r.people)}</Text>
        </View>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  cardTitle: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "600" },
  cardAside: { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  inner: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, gap: 8 },
  tile: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, gap: 2, flexGrow: 1 },
  tileLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 15 },
  tileValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", lineHeight: 23, fontVariant: ["tabular-nums"] },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 11, lineHeight: 14 },
  muted: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  strong: { color: "#FFFFFF", fontWeight: "700" },
  legend: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  track: { height: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, overflow: "hidden", flexDirection: "row" },
  fill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 999 },
  splitLabels: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badgeBlank: { width: 22, height: 22, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.1)" },
  badgeName: { color: "#FFFFFF", fontSize: 12 },
  badgeCount: { color: "#FFFFFF", fontSize: 12, fontWeight: "600", width: 44, textAlign: "right", fontVariant: ["tabular-nums"] },
});
