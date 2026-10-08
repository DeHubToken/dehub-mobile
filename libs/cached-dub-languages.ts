export const CHATTERBOX_LANGUAGES = new Set(['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh']);
export function dubLanguage(language: string | null | undefined): string {
  return (language || '').trim().toLowerCase().replace(/_/g, '-');
}
export const hasCachedDubLanguage = (language: string | null | undefined) => CHATTERBOX_LANGUAGES.has(dubLanguage(language).split('-')[0]);
