export const CHATTERBOX_LANGUAGES = new Set(['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh']);
export function dubLanguage(language: string | null | undefined): string {
  const value = (language || '').toLowerCase();
  return /^zh-(tw|hant|hk)/.test(value) ? 'zh-TW' : value.split(/[-_]/)[0];
}
export const hasCachedDubLanguage = (language: string | null | undefined) => CHATTERBOX_LANGUAGES.has(dubLanguage(language).split('-')[0]);
