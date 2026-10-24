export function chartCategoryColour(colours: readonly string[], index: number): string {
  const value = colours[index % Math.max(1, colours.length)];
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : "#ffffff";
}
export function setChartCategoryColour(colours: readonly string[], count: number, index: number, colour: string): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(index) || index < 0 || index >= count || !/^#[\da-f]{6}$/i.test(colour)) throw new Error("Choose an existing chart category and a six-digit hex colour");
  return Array.from({ length: Math.max(count, Math.min(50, colours.length)) }, (_, position) => position === index ? colour : chartCategoryColour(colours, position));
}
