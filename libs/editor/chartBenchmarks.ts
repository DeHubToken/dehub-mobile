export const CHART_BENCHMARKS = ["average", "median", "minimum", "maximum"] as const;
export type ChartBenchmark = typeof CHART_BENCHMARKS[number];
export const CHART_BENCHMARK_LABELS: Record<ChartBenchmark, string> = { average: "Average", median: "Median", minimum: "Minimum", maximum: "Maximum" };
export function chartBenchmark(values: readonly number[], kind: ChartBenchmark): number {
  const data = values.filter(value => Number.isFinite(value) && Math.abs(value) <= 1e12).slice(0, 300).sort((a, b) => a - b);
  if (!data.length) throw new Error("Add valid chart values before choosing a benchmark");
  const middle = Math.floor(data.length / 2), result = kind === "average" ? data.reduce((sum, value) => sum + value, 0) / data.length : kind === "median" ? data.length % 2 ? data[middle] : (data[middle - 1] + data[middle]) / 2 : kind === "minimum" ? data[0] : data[data.length - 1];
  return Number(result.toPrecision(12));
}
