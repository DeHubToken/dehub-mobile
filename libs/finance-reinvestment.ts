/** Retained historical operating funds were fully reinvested, as reported by DeHub. */
export interface FinanceAccountingDay {
  date: string;
  revenue: Record<string, number>;
  costs: Record<string, number>;
}
export function withReinvestedOperations<T extends { days: FinanceAccountingDay[] }>(stats: T): Omit<T, 'days'> & { days: FinanceAccountingDay[] } {
  const months = new Map<string, { retained: number; recorded: number; days: number }>();
  for (const day of stats.days) {
    const key = day.date.slice(0, 7);
    const month = months.get(key) ?? { retained: 0, recorded: 0, days: 0 };
    month.retained += day.revenue.bsc_token_tax ?? 0;
    month.recorded += Object.values(day.costs).reduce((sum, value) => sum + value, 0);
    month.days++;
    months.set(key, month);
  }
  return {
    ...stats,
    days: stats.days.map(day => {
      const month = months.get(day.date.slice(0, 7))!;
      const remaining = Math.max(0, month.retained - month.recorded);
      if (remaining < 0.005) return day;
      return {
        ...day,
        costs: { ...day.costs, operations_reinvestment: (day.costs.operations_reinvestment ?? 0) + remaining / month.days },
      };
    }),
  };
}
