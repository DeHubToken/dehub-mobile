import { normaliseBrandStyles } from "./brandStyles";
export function qrBrandColours(colours: readonly string[]): string[] {
  const luminance = (hex: string) => { const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4); return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; };
  const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const palette = normaliseBrandStyles({ colors: [...colours], headingFont: null, bodyFont: null }).colors.sort((a, b) => luminance(a) - luminance(b));
  if (!palette.length) return ["#000000", "#ffffff"];
  let foreground = palette[0], background = palette[palette.length - 1];
  if (contrast(foreground, background) < 4.5) { if (contrast(foreground, "#ffffff") >= contrast("#000000", background)) background = "#ffffff"; else foreground = "#000000"; }
  return [foreground, background];
}
