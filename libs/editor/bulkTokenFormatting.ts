import { CHART_CURRENCIES, CHART_NUMBER_LOCALES, chartValueLabel } from "./chartValueFormat";
export type BulkTokenFormat = "plain" | "uppercase" | "lowercase" | "title" | "number" | "percent" | "currency";
export interface BulkTokenOptions { header: string; format: BulkTokenFormat; trim: boolean; fallback: string; prefix: string; suffix: string; decimals: number; currency: typeof CHART_CURRENCIES[number]; locale: typeof CHART_NUMBER_LOCALES[number] }

export function bulkTokenHeader(expression: string, headers: readonly string[]): string | undefined {
  const exact = expression.trim();
  return headers.includes(exact) ? exact : headers.find(header => header === exact.split("|")[0].trim());
}

export function formatBulkToken(expression: string, headers: readonly string[], row: readonly string[]): string | null {
  const header = bulkTokenHeader(expression, headers);
  if (header === undefined) return null;
  let value = row[headers.indexOf(header)] ?? "";
  if (expression.trim() === header) return value;
  const rules = expression.split("|").slice(1);
  if (rules.length > 6) throw new Error(`Column ${header}: use up to six placeholder formats`);
  for (const raw of rules) {
    const rule = raw.trim(), separator = rule.indexOf(":"), name = separator < 0 ? rule : rule.slice(0, separator), argument = separator < 0 ? "" : rule.slice(separator + 1);
    if (name === "trim" && !argument) value = value.trim();
    else if (name === "uppercase" && !argument) value = value.toUpperCase();
    else if (name === "lowercase" && !argument) value = value.toLowerCase();
    else if (name === "title" && !argument) value = value.replace(/\p{L}[\p{L}\p{M}]*/gu, word => { const letters = Array.from(word); return letters[0].toUpperCase() + letters.slice(1).join("").toLowerCase(); });
    else if (["default", "prefix", "suffix"].includes(name) && separator >= 0 && argument.length <= 6000) {
      let text = argument;
      try { if (/%[a-f\d]{2}/i.test(text)) text = decodeURIComponent(text); } catch { throw new Error(`Column ${header}: use a valid encoded placeholder argument`); }
      if (text.length > 500 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`Column ${header}: keep placeholder arguments within 500 printable characters`);
      if (name === "default") { if (!value.trim()) value = text; }
      else value = name === "prefix" ? text + value : value + text;
    } else if (["number", "percent", "currency"].includes(name)) {
      const parts = argument.split(":"), currency = name === "currency" ? parts.shift() : "USD", decimals = Number(parts.shift() ?? "0"), locale = parts.shift() || "en-US";
      if (parts.length || !Number.isInteger(decimals) || decimals < 0 || decimals > 4 || !(CHART_CURRENCIES as readonly string[]).includes(currency ?? "") || !(CHART_NUMBER_LOCALES as readonly string[]).includes(locale)) throw new Error(`Column ${header}: choose valid decimals, currency and locale`);
      const numeric = Number(value.trim());
      if (!value.trim() || !Number.isFinite(numeric) || Math.abs(numeric) > 1e12) throw new Error(`Column ${header}: numeric formatting needs a plain number within one trillion`);
      value = chartValueLabel(numeric, { style: name as "number" | "percent" | "currency", decimals, currency: currency as typeof CHART_CURRENCIES[number], locale: locale as typeof CHART_NUMBER_LOCALES[number], compact: false });
    } else throw new Error(`Column ${header}: unsupported placeholder format ${name.slice(0, 40)}`);
    if (value.length > 10000) throw new Error(`Column ${header}: formatted text exceeds 10,000 characters`);
  }
  return value;
}

export function buildBulkToken(options: BulkTokenOptions): string {
  if (!options.header.trim() || /[|{}\r\n]/.test(options.header)) throw new Error("Formatted placeholders need a column name without braces, pipes or line breaks");
  if ([options.fallback, options.prefix, options.suffix].some(value => value.length > 500 || /[\u0000-\u001f\u007f]/.test(value))) throw new Error("Use up to 500 printable characters for fallback text, prefixes and suffixes");
  const rules = [options.header];
  if (options.trim) rules.push("trim");
  if (options.fallback) rules.push("default:" + encodeURIComponent(options.fallback));
  if (["number", "percent", "currency"].includes(options.format)) rules.push(`${options.format}:${options.format === "currency" ? options.currency + ":" : ""}${options.decimals}:${options.locale}`);
  else if (options.format !== "plain") rules.push(options.format);
  if (options.prefix) rules.push("prefix:" + encodeURIComponent(options.prefix));
  if (options.suffix) rules.push("suffix:" + encodeURIComponent(options.suffix));
  return "{{" + rules.join(" | ") + "}}";
}
