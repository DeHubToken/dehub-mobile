import type { TableData } from "./dataVisuals";

export type TableAppearance = Pick<TableData, "headerColour" | "headerTextColour" | "cellColour" | "textColour" | "borderColour" | "stripeColour" | "borderWidth">;
export interface TableStylePreset { id: string; label: string; appearance: TableAppearance }
export const TABLE_STYLE_PRESETS: readonly TableStylePreset[] = [
  { id: "paper", label: "Paper", appearance: { headerColour: "#222222", headerTextColour: "#ffffff", cellColour: "#ffffff", textColour: "#222222", borderColour: "#d4d4d4", stripeColour: null, borderWidth: 1 } },
  { id: "midnight", label: "Midnight", appearance: { headerColour: "#38bdf8", headerTextColour: "#082f49", cellColour: "#172033", textColour: "#f1f5f9", borderColour: "#334155", stripeColour: "#1e293b", borderWidth: 0.5 } },
  { id: "sage", label: "Sage", appearance: { headerColour: "#355e4b", headerTextColour: "#ffffff", cellColour: "#f7faf5", textColour: "#243e31", borderColour: "#c9d8c5", stripeColour: "#e8f0e4", borderWidth: 0.5 } },
  { id: "sand", label: "Sand", appearance: { headerColour: "#7c5539", headerTextColour: "#fffaf3", cellColour: "#fffaf3", textColour: "#49392a", borderColour: "#e3d3bc", stripeColour: "#f3e9da", borderWidth: 0.5 } },
  { id: "lavender", label: "Lavender", appearance: { headerColour: "#5b3e8a", headerTextColour: "#ffffff", cellColour: "#fcfaff", textColour: "#35264d", borderColour: "#ded2ee", stripeColour: "#f0e8fa", borderWidth: 0.5 } },
  { id: "ocean", label: "Ocean", appearance: { headerColour: "#075985", headerTextColour: "#ffffff", cellColour: "#f4fbff", textColour: "#0c3c59", borderColour: "#b8dcec", stripeColour: "#e0f2fe", borderWidth: 0.5 } },
  { id: "rose", label: "Rose", appearance: { headerColour: "#9f3352", headerTextColour: "#ffffff", cellColour: "#fff9fa", textColour: "#5b2435", borderColour: "#edc6d0", stripeColour: "#fce7ed", borderWidth: 0.5 } },
  { id: "minimal", label: "Minimal", appearance: { headerColour: "#ededed", headerTextColour: "#111111", cellColour: "#ffffff", textColour: "#333333", borderColour: "#ffffff", stripeColour: "#f5f5f5", borderWidth: 0 } },
];
export const TABLE_DENSITIES = [
  { id: "compact", label: "Compact", padding: 4, fontScale: 0.85 },
  { id: "standard", label: "Standard", padding: 12, fontScale: 1 },
  { id: "spacious", label: "Spacious", padding: 28, fontScale: 1.15 },
] as const;
export function applyTablePreset(value: Omit<TableData, "rows">, preset: TableStylePreset, clearOverrides: boolean): Omit<TableData, "rows"> {
  return { ...value, ...preset.appearance, cellStyles: clearOverrides ? undefined : value.cellStyles };
}
export function tablePresetMatches(value: Omit<TableData, "rows">, preset: TableStylePreset): boolean {
  return (Object.keys(preset.appearance) as (keyof TableAppearance)[]).every(key => (value[key] ?? (key === "borderWidth" ? 1 : null)) === preset.appearance[key]);
}
