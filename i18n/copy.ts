import { t } from 'i18next';

/** Display copy can be read before the language service finishes starting. */
export function translateCopy(key: string, options: { defaultValue: string; [key: string]: unknown }): string {
  return t(key, options) || options.defaultValue;
}
