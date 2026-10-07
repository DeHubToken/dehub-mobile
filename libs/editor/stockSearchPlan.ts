export type StockOrientation = "all" | "landscape" | "portrait" | "square";
export function stockSearchPlan(query: string, orientation: StockOrientation): [string, StockOrientation][] {
  const clean = query.trim().replace(/\s+/g, " ");
  const short = clean.split(/\s+/).slice(0, 2).join(" ");
  const seen = new Set<string>();
  return ([[clean, orientation], [clean, "all"], [short, "all"]] as [string, StockOrientation][]).filter(([q, o]) => {
    const key = JSON.stringify([q, o]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
