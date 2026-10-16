export const PERCENT_STACKED_SERIES_RUNTIME = String.raw`function percentStackedSeries(input) {
  const sets = input.slice(0, 6), length = Math.min(50, Math.max(0, ...sets.map(set => set.length)));
  const positive = Array.from({ length }, (_, index) => sets.reduce((sum, set) => sum + Math.max(0, Number.isFinite(set[index]) ? set[index] : 0), 0));
  const negative = Array.from({ length }, (_, index) => sets.reduce((sum, set) => sum + Math.max(0, Number.isFinite(set[index]) ? -set[index] : 0), 0));
  return sets.map(set => Array.from({ length }, (_, index) => { const value = Number.isFinite(set[index]) ? set[index] : 0, total = value < 0 ? negative[index] : positive[index]; return total > 0 ? value / total * 100 : 0; }));
}
`;
