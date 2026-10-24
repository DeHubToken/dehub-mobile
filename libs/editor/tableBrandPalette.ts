import { normaliseBrandStyles } from "./brandStyles";
import { readableTableInk } from "./tableColourScale";
import type { TableData } from "./dataVisuals";
export function tableFromBrandPalette(value: Omit<TableData, "rows">, colours: readonly string[]): Omit<TableData, "rows"> {
  const palette = normaliseBrandStyles({ colors: [...colours], headingFont: null, bodyFont: null }).colors;
  if (!palette.length) return value;
  const headerColour = palette[0], blend = (amount: number) => "#" + [1, 3, 5].map(index => Math.round(parseInt(value.cellColour.slice(index, index + 2), 16) * (1 - amount) + parseInt(headerColour.slice(index, index + 2), 16) * amount).toString(16).padStart(2, "0")).join("");
  return { ...value, headerColour, headerTextColour: readableTableInk(headerColour), textColour: readableTableInk(value.cellColour), borderColour: blend(0.35), stripeColour: value.stripeColour ? blend(0.1) : value.stripeColour };
}
