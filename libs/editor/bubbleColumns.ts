export function remapBubbleColumns(value: { bubbleYSeries?: number; bubbleSizeSeries?: number }, order: readonly (number | null)[]): { bubbleYSeries: number; bubbleSizeSeries: number } {
  return { bubbleYSeries: Math.max(0, order.indexOf(value.bubbleYSeries ?? 0)), bubbleSizeSeries: value.bubbleSizeSeries === -1 ? -1 : order.indexOf(value.bubbleSizeSeries ?? 1) };
}
