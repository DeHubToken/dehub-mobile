export interface TextListStyle { start: number; numbering: "decimal" | "alpha-lower" | "alpha-upper" | "roman-lower" | "roman-upper"; bullet: "disc" | "circle" | "square" | "dash" | "check" }
export const DEFAULT_TEXT_LIST_STYLE: TextListStyle = { start: 1, numbering: "decimal", bullet: "disc" };
export function validTextListStyle(value: unknown): value is TextListStyle | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const style = value as TextListStyle;
  return Number.isInteger(style.start) && style.start >= 1 && style.start <= 9999 && ["decimal", "alpha-lower", "alpha-upper", "roman-lower", "roman-upper"].includes(style.numbering) && ["disc", "circle", "square", "dash", "check"].includes(style.bullet);
}
function textListDigits(value: number, style: string): string {
  value = Math.max(1, Math.min(20000, Math.floor(value)));
  let output = "";
  if (style.startsWith("alpha")) { for (let n = value; n > 0; n = Math.floor((n - 1) / 26)) output = String.fromCharCode(65 + (n - 1) % 26) + output; }
  else if (style.startsWith("roman") && value < 4000) {
    let rest = value;
    const amounts = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1], symbols = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    amounts.forEach((amount, index) => { while (rest >= amount) { output += symbols[index]; rest -= amount; } });
  } else output = String(value);
  return style.endsWith("lower") ? output.toLowerCase() : output;
}
export function formatTextList(source: string, kind: unknown, options?: TextListStyle): string {
  if (kind !== "bullet" && kind !== "number") return source;
  const start = options && Number.isInteger(options.start) ? Math.max(1, Math.min(9999, options.start)) : 1;
  const style = options?.numbering ?? "decimal", bullet = options?.bullet ?? "disc";
  const marker = bullet === "circle" ? "◦" : bullet === "square" ? "▪" : bullet === "dash" ? "–" : bullet === "check" ? "✓" : "•";
  let item = start;
  return source.replace(/\r\n?/g, "\n").split("\n").map(line => line.trim() ? (kind === "bullet" ? marker : textListDigits(item++, style) + ".") + " " + line : line).join("\n");
}
