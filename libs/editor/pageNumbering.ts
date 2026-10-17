import type { Clip, TextClip } from "./types";

export interface PageNumberFormat { start: number; style: "decimal" | "roman" | "alpha"; total: boolean; prefix: string; suffix: string }
export const DEFAULT_PAGE_NUMBER_FORMAT: PageNumberFormat = { start: 1, style: "decimal", total: false, prefix: "", suffix: "" };
export function validPageNumberFormat(value: unknown): value is PageNumberFormat {
  if (!value || typeof value !== "object") return false;
  const v = value as PageNumberFormat;
  return Number.isInteger(v.start) && v.start >= 1 && v.start <= 9999 && ["decimal", "roman", "alpha"].includes(v.style) && typeof v.total === "boolean" && typeof v.prefix === "string" && v.prefix.length <= 40 && typeof v.suffix === "string" && v.suffix.length <= 40;
}
function digits(value: number, style: PageNumberFormat["style"]): string {
  value = Number.isFinite(value) ? Math.max(1, Math.min(20000, Math.floor(value))) : 1;
  if (style === "alpha") { let result = ""; for (let n = value; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; }
  if (style === "roman" && value < 4000) { let rest = value, result = ""; for (const [amount, text] of [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]] as const) while (rest >= amount) { result += text; rest -= amount; } return result; }
  return String(value);
}
export function pageNumberText(index: number, count: number, format: PageNumberFormat): string {
  return format.prefix + digits(index + format.start, format.style) + (format.total ? ` / ${digits(count + format.start - 1, format.style)}` : "") + format.suffix;
}
/** Page changes keep generated text in sync while retaining each label's typography and placement. */
export function refreshPageNumberClips(clips: Clip[], starts: readonly number[]): Clip[] {
  return clips.map(clip => {
    if (clip.kind !== "text" || !validPageNumberFormat(clip.pageNumber) || clip.locked) return clip;
    let index = 0; for (let i = 1; i < starts.length; i++) if (clip.start >= starts[i] - 1e-6) index = i; else break;
    const text = pageNumberText(index, starts.length || 1, clip.pageNumber);
    return text === clip.text ? clip : { ...clip, text } as TextClip;
  });
}
