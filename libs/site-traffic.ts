/** Range maths for the Stats page traffic section (see components/Stats/TrafficSection). */

export interface SiteStatsDay { date: string; visitors: number; pageViews: number; requests: number }
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
