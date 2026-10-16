import { DESIGN_PANEL_NAMES, type DesignPanelId } from "./designPanels";
export type DesignToolPanelId = Exclude<DesignPanelId, "groups" | "insert">;
export interface DesignCommand { id: DesignToolPanelId; category: "create" | "edit" | "document"; detail: string; keywords: string }
export const DESIGN_COMMANDS: DesignCommand[] = [
  { id: "help", category: "document", detail: "Find editor shortcuts, gestures, and editing guidance", keywords: "help guide keyboard shortcut gestures learn controls tutorial" },
  { id: "elements", category: "create", detail: "Save and reuse custom text and vector groups across designs", keywords: "saved elements library reusable badge sticker template favourite favorite custom group" },
  { id: "repeat", category: "create", detail: "Repeat selected artwork with precise rows, columns, and gaps", keywords: "duplicate repeat sticker pattern grid sheet badge card" },
  { id: "symbols", category: "create", detail: "Search editable vector symbols and pictograms", keywords: "icons arrows pictograms illustrations vector saved recent favourites favorites" },
  { id: "connectors", category: "create", detail: "Create straight, curved, and elbow connectors", keywords: "line arrow diagram flowchart bend stroke" },
  { id: "data", category: "create", detail: "Create and edit charts and tables from data", keywords: "graph spreadsheet csv table cells merge pie donut bar insert delete row column series reorder duplicate order scale legend scatter xy points" },
  { id: "qr", category: "create", detail: "Generate an editable QR code", keywords: "link scan barcode code" },
  { id: "grid", category: "create", detail: "Arrange photos in frames and collage layouts", keywords: "frame mask photo collage grid swap shuffle rearrange rotate order" },
  { id: "compositions", category: "create", detail: "Add coordinated headings and text combinations", keywords: "typography font heading subtitle title pairing" },
  { id: "bulk", category: "create", detail: "Make multiple pages from spreadsheet rows", keywords: "csv spreadsheet bulk data merge certificate batch" },
  { id: "fill", category: "edit", detail: "Edit solid fills, gradients, and page backgrounds", keywords: "gradient colour color background wallpaper photo" },
  { id: "colours", category: "edit", detail: "Replace colours throughout this document", keywords: "color palette replace theme swatch brand" },
  { id: "search", category: "edit", detail: "Find text, replace words, and change fonts", keywords: "find replace search text spelling font" },
  { id: "layout", category: "edit", detail: "Align layers, distribute spacing, and tidy layouts", keywords: "align position spacing grid centre center distribute" },
  { id: "animate", category: "edit", detail: "Apply entrance and exit animations to pages or layers", keywords: "animation motion transition fade pop spin" },
  { id: "link", category: "edit", detail: "Link selected artwork to a website or another page", keywords: "hyperlink url email phone navigation interactive" },
  { id: "resize", category: "document", detail: "Change dimensions, units, or print resolution", keywords: "size dimension pixels inches centimetres print dpi paper rotate proportional fit fill anchor scale" },
  { id: "pages", category: "document", detail: "Find, reorder, duplicate, or delete pages", keywords: "manage batch sort move page duplicate hide show skip presentation" },
  { id: "document", category: "document", detail: "Add page numbers or repeat headers, footers, and logos", keywords: "number footer header repeat logo document" },
  { id: "notes", category: "document", detail: "Name pages and add presenter notes", keywords: "speaker presentation notes name title" },
  { id: "guides", category: "document", detail: "Create rulers, guides, margins, and layout grids", keywords: "ruler grid guide margin columns gutter snapping" },
];
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function searchDesignCommands(query: string, recent: readonly DesignToolPanelId[] = []): DesignCommand[] {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  return DESIGN_COMMANDS.filter(command => words.every(word => normalized(`${DESIGN_PANEL_NAMES[command.id]} ${command.detail} ${command.keywords}`).includes(word)))
    .sort((a, b) => { const score = (command: DesignCommand) => !words.length ? recent.includes(command.id) ? recent.indexOf(command.id) - 10 : 0 : normalized(DESIGN_PANEL_NAMES[command.id]).startsWith(words.join(" ")) ? -1 : 0; return score(a) - score(b); });
}
