import type { Clip } from "./types";

export const DESIGN_PANEL_NAMES = {
  help: "Editor guide", elements: "Saved elements", repeat: "Repeat selection in a grid", document: "Page numbers and repeated elements", pages: "Manage pages", resize: "Resize", search: "Find and replace", colours: "Document colours", data: "Charts and tables", fill: "Fills and backgrounds", qr: "QR code", grid: "Photo grids", guides: "Guides and margins", layout: "Position and spacing", groups: "Position and groups", notes: "Page notes", link: "Link", compositions: "Text combinations", bulk: "Bulk create", animate: "Animate page", connectors: "Lines and connectors", symbols: "Vector symbols", insert: "Insert",
} as const;
export type DesignPanelId = keyof typeof DESIGN_PANEL_NAMES;
export interface DesignSelectionAction { id: string; label: string; panel?: "data" | "fill" | "qr" | "connectors" | "symbols"; edit?: "text" | "crop" | "shape" }

export function designSelectionAction(clip: Clip): DesignSelectionAction | null {
  if (clip.kind === "audio") return null;
  if (clip.kind === "text") return { id: "text", label: "Edit text", edit: "text" };
  if (clip.kind === "image" || clip.kind === "video") return { id: clip.isPageBackground ? "reframe" : clip.kind === "image" ? "photo" : "video", label: clip.isPageBackground ? "Reframe background" : clip.kind === "image" ? "Crop photo" : "Crop video", edit: "crop" };
  if (clip.kind !== "shape") return null;
  if (clip.chart) return { id: "chart", label: "Edit chart", panel: "data" };
  if (clip.table) return { id: "table", label: "Edit table", panel: "data" };
  if (clip.qr) return { id: "qr", label: "Edit QR code", panel: "qr" };
  if (clip.connector || clip.shape === "line" || clip.shape === "arrow") return { id: "connector", label: "Edit connector", panel: "connectors" };
  if (clip.symbol) return { id: "symbol", label: "Edit symbol", panel: "symbols" };
  if (clip.isPageBackground) return { id: "background", label: "Edit page background", panel: "fill" };
  return { id: "shape", label: clip.photoFrame ? "Edit frame" : "Edit shape", edit: "shape" };
}
