import labels from './watched-labels.json';

/** Localised suffix kept with this feature; unavailable locales use English. */
export function watchedLabel(language?: string): string {
  const code = (language ?? 'en').toLowerCase().replace('_', '-');
  const translated = labels as Record<string, string>;
  return translated[code] ?? translated[code.split('-')[0]] ?? translated.en;
}
