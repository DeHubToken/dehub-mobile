import type { ChartKind } from "./dataVisuals";
export const CHART_TYPE_GROUPS = ["all", "comparison", "trend", "composition", "relationship", "distribution", "hierarchy"] as const;
export type ChartTypeGroup = typeof CHART_TYPE_GROUPS[number];
export const CHART_TYPE_GROUP_LABELS: Record<ChartTypeGroup, string> = { all: "All charts", comparison: "Compare", trend: "Trends", composition: "Parts of a whole", relationship: "Relationships", distribution: "Distribution", hierarchy: "Hierarchy" };
export const CHART_TYPE_DETAILS: Record<ChartKind, { label: string; group: ChartTypeGroup; hint: string; path: string }> = {
  column: { label: "Column", group: "comparison", hint: "Compare values with vertical bars", path: "M5 27V16H11V27ZM17 27V7H23V27ZM29 27V12H35V27Z" },
  bar: { label: "Bar", group: "comparison", hint: "Compare categories with horizontal bars", path: "M5 5H22V11H5ZM5 15H35V21H5ZM5 25H28V31H5Z" },
  line: { label: "Line", group: "trend", hint: "Follow change across ordered categories", path: "M4 27L13 17L22 22L35 6M4 30H36" },
  area: { label: "Area", group: "trend", hint: "Show change with a filled baseline", path: "M4 28L12 18L22 22L35 7V29H4ZM9 27V23M15 27V22M21 27V25M27 27V20M33 27V14" },
  lollipop: { label: "Lollipop", group: "comparison", hint: "Compare values using stems and points", path: "M8 28V18M20 28V8M32 28V14M5 15H11V18H5ZM17 5H23V8H17ZM29 11H35V14H29Z" },
  dot: { label: "Dot plot", group: "comparison", hint: "Compare category values with points", path: "M5 28H35M8 19A2 2 0 1 0 8 15A2 2 0 1 0 8 19M20 9A2 2 0 1 0 20 5A2 2 0 1 0 20 9M32 15A2 2 0 1 0 32 11A2 2 0 1 0 32 15" },
  pie: { label: "Pie", group: "composition", hint: "Show each positive value as part of a total", path: "M20 4A13 13 0 1 0 33 17H20ZM23 3V14H35A13 13 0 0 0 23 3" },
  donut: { label: "Donut", group: "composition", hint: "Show shares with optional centre text", path: "M20 4A13 13 0 1 0 33 17H26A6 6 0 1 1 20 11ZM23 3V10A7 7 0 0 1 27 14H35A13 13 0 0 0 23 3" },
  radar: { label: "Radar", group: "comparison", hint: "Compare several measures around a shared scale", path: "M20 3L36 14L30 30H10L4 14ZM20 3V21L4 14M20 21L10 30M20 21L30 30M20 21L36 14M20 9L30 15L25 25L13 24L10 15Z" },
  scatter: { label: "Scatter", group: "relationship", hint: "Plot numeric X and Y coordinates", path: "M4 3V29H37M10 23H13V20H10ZM17 15H20V12H17ZM26 19H29V16H26ZM31 9H34V6H31Z" },
  bubble: { label: "Bubble", group: "relationship", hint: "Plot X, Y and a separate size value", path: "M4 3V29H37M12 25A3 3 0 1 0 12 19A3 3 0 1 0 12 25M23 18A6 6 0 1 0 23 6A6 6 0 1 0 23 18M33 25A4 4 0 1 0 33 17A4 4 0 1 0 33 25" },
  funnel: { label: "Funnel", group: "composition", hint: "Compare stages in their data-row order", path: "M3 4H37L32 11H8ZM9 14H31L27 21H13ZM14 24H26L23 30H17Z" },
  histogram: { label: "Histogram", group: "distribution", hint: "Group raw observations into frequency bins", path: "M4 28V20H12V28ZM12 28V10H20V28ZM20 28V4H28V28ZM28 28V15H36V28Z" },
  "packed-circles": { label: "Packed circles", group: "hierarchy", hint: "Group proportional leaf circles inside nested outlines", path: "M20 3A14 14 0 1 0 20 31A14 14 0 1 0 20 3M14 10A6 6 0 1 0 14 22A6 6 0 1 0 14 10M26 8A4 4 0 1 0 26 16A4 4 0 1 0 26 8M25 19A4 4 0 1 0 25 27A4 4 0 1 0 25 19" },
  "progress-bar": { label: "Progress bar", group: "composition", hint: "Show a single completion percentage on a horizontal track", path: "M3 10H37V24H3ZM3 10H25V24H3ZM7 14V20M11 14V20M15 14V20M19 14V20" },
  "progress-ring": { label: "Progress ring", group: "composition", hint: "Show completion with a thin circular ring", path: "M20 3A14 14 0 1 0 34 17M20 7A10 10 0 1 0 30 17M20 3V7M30 17H34" },
  "radial-progress": { label: "Radial progress", group: "composition", hint: "Highlight a percentage with a bold circular band", path: "M20 3A14 14 0 1 0 34 17H27A7 7 0 1 1 20 10ZM20 3V10" },
  "progress-dial": { label: "Progress dial", group: "composition", hint: "Display a completion percentage on a semicircular gauge", path: "M3 27A17 17 0 0 1 37 27H30A10 10 0 0 0 10 27ZM20 27L28 14" },
  race: { label: "Bar chart race", group: "trend", hint: "Animate changing category rankings across frames", path: "M4 5H25V10H4ZM4 15H34V20H4ZM4 25H19V30H4ZM29 3L36 7L29 11ZM23 23L30 27L23 31Z" },
  pictogram: { label: "Pictogram", group: "composition", hint: "Represent shares with a grid of repeated symbols", path: "M5 4H10V9H5ZM17 4H22V9H17ZM29 4H34V9H29ZM5 15H10V20H5ZM17 15H22V20H17ZM29 15H34V20H29ZM5 26H10V31H5ZM17 26H22V31H17ZM29 26H34V31H29Z" },
  treemap: { label: "Treemap", group: "hierarchy", hint: "Compare nested groups as proportional tiles", path: "M3 3H37V30H3ZM3 9H37M19 9V30M3 20H19M29 9V30M19 23H29" },
};
