import { t } from 'i18next';

/** Display copy can be read before the language service finishes starting. */
export function translateCopy(key: string, options: { defaultValue: string; [key: string]: unknown }): string {
  return t(key, options) || fillPlaceholders(options.defaultValue, options);
}

/** Before i18next starts, `t` returns nothing, so the English still needs its values filled in. */
function fillPlaceholders(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => (values[name] === undefined ? match : String(values[name])));
}
