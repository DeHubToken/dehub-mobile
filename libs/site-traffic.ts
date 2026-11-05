/** Range maths for the Stats page traffic section (see components/Stats/TrafficSection). */

export interface SiteStatsDay { date: string; visitors: number; pageViews: number; requests: number }
export interface SiteStatsZone { name: string; ok: boolean; daily?: SiteStatsDay[] }
export interface SiteStatsBreakdownDay {
  date: string;
  countries: { code: string; requests: number }[];
  browsers: { name: string; pageViews: number }[];
}
/** Totals for a range, plus the top countries and browsers across its days. */
export function summarizeTraffic(daily: SiteStatsDay[], breakdown: SiteStatsBreakdownDay[], days: number | null) {
  const rows = days == null ? daily : daily.slice(-days);
  const parts = days == null ? breakdown : breakdown.slice(-days);
  const countries = new Map<string, number>();
  const browsers = new Map<string, number>();
  for (const row of parts) {
    for (const c of row.countries) countries.set(c.code, (countries.get(c.code) ?? 0) + c.requests);
    for (const b of row.browsers) browsers.set(b.name, (browsers.get(b.name) ?? 0) + b.pageViews);
  }
  const top = <K,>(m: Map<K, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    rows,
    breakdownDays: parts.length,
    today: daily[daily.length - 1]?.visitors ?? 0,
    visitors: rows.reduce((s, r) => s + r.visitors, 0),
    pageViews: rows.reduce((s, r) => s + r.pageViews, 0),
    requests: rows.reduce((s, r) => s + r.requests, 0),
    countries: top(countries, 8),
    browsers: top(browsers, 6),
  };
}

/**
 * Same correction web's Stats page makes (src/hooks/use-site-stats.ts). Since
 * 24 Oct dehub.io is served through a relay, so Cloudflare sees most visitors
 * as one address and the unique count collapses while page views carry on.
 * Those days are rebuilt as page views x the median visitors-per-page-view of
 * the last clean days. Each zone (dehub.io, riftn.com) is corrected on its own,
 * then the zones are added per day.
 */
const RELAYED_RATIO = 0.06;
const BASELINE_DAYS = 28;

function correctZone(daily: SiteStatsDay[]): SiteStatsDay[] {
  const ratioOf = (d: SiteStatsDay) => (d.pageViews > 0 ? d.visitors / d.pageViews : null);
  const relayed = (d: SiteStatsDay) => {
    const r = ratioOf(d);
    return r != null && r < RELAYED_RATIO;
  };
  const clean = daily.filter((d) => ratioOf(d) != null && !relayed(d)).slice(-BASELINE_DAYS);
  if (!clean.length || !daily.some(relayed)) return daily;
  const ratios = clean.map((d) => ratioOf(d) as number).sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const ratio = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
  return daily.map((d) => (relayed(d) ? { ...d, visitors: Math.round(d.pageViews * ratio) } : d));
}

export function correctVisitors(daily: SiteStatsDay[], zones?: SiteStatsZone[]): SiteStatsDay[] {
  const readable = (zones ?? []).filter((z) => z.ok && z.daily);
  if (readable.length < 2) return correctZone(daily);
  const byDate = new Map<string, SiteStatsDay>();
  for (const zone of readable) {
    for (const d of correctZone(zone.daily!)) {
      const prev = byDate.get(d.date);
      byDate.set(d.date, prev
        ? { date: d.date, visitors: prev.visitors + d.visitors, pageViews: prev.pageViews + d.pageViews, requests: prev.requests + d.requests }
        : { date: d.date, visitors: d.visitors, pageViews: d.pageViews, requests: d.requests });
    }
  }
  return [...byDate.keys()].sort().map((k) => byDate.get(k)!);
}
