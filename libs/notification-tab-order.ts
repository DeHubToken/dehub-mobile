export function orderNotificationTabKeys<T extends string>(
  tabs: readonly T[],
  activityCounts: Readonly<Partial<Record<T, number>>>,
  allTab: T,
): T[] {
  return tabs
    .map((tab, index) => ({ tab, index }))
    .sort((a, b) => {
      if (a.tab === allTab) return -1;
      if (b.tab === allTab) return 1;

      return (activityCounts[b.tab] ?? 0) - (activityCounts[a.tab] ?? 0)
        || a.index - b.index;
    })
    .map(({ tab }) => tab);
}
