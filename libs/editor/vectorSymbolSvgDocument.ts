import { VECTOR_SYMBOLS, vectorSymbolSvg } from "./vectorSymbols";
export function vectorSymbolSvgDocument(id: string, colour: string, weight: number, size = 1024): string {
  const symbol = VECTOR_SYMBOLS.find(symbol => symbol.id === id);
  if (!symbol || !/^#[a-f0-9]{6}$/i.test(colour) || !Number.isFinite(weight) || weight < 1 || weight > 40 || !Number.isInteger(size) || size < 64 || size > 8192) throw new Error("Choose a library symbol, six-digit colour and line weight from 1 to 40");
  const stroke = Math.max(0.5, weight / 6), padding = Math.max(1, stroke / 2 + 1), edge = 24 + padding * 2;
  const title = symbol.label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-padding} ${-padding} ${edge} ${edge}" role="img" aria-labelledby="symbol-title"><title id="symbol-title">${title}</title><path d="${vectorSymbolSvg(id)}" fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
}
