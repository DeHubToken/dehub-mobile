import { normaliseBrandStyles } from "./brandStyles";
import { gradientFromColours, type GradientFill } from "./gradientFill";
export function gradientFromBrandPalette(value: GradientFill, colours: readonly string[]): GradientFill {
  const palette = normaliseBrandStyles({ colors: [...colours], headingFont: null, bodyFont: null }).colors;
  if (palette.length < 2) throw new Error("Choose a saved palette with at least two colours");
  const sampled = palette.length <= 8 ? palette : Array.from({ length: 8 }, (_, index) => palette[Math.round(index * (palette.length - 1) / 7)]);
  return { ...value, stops: gradientFromColours(sampled).stops };
}
