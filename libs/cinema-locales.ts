/**
 * Country selection for Cinema. Mirrors dehubweb's src/lib/cinema-locales.ts.
 *
 * Streaming rights are per territory: the same film is a rental in one
 * country, included with a subscription in another and unavailable in a
 * third. Every JustWatch call carries a locale and the viewer can change it.
 *
 * `country` is the English name; screens show `cinema.countries.<REGION>`
 * through t() (see countryKey).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

export interface CinemaLocale {
  /** JustWatch locale, `xx_YY`. */
  locale: string;
  country: string;
  flag: string;
}

export const CINEMA_LOCALES: CinemaLocale[] = [
  { locale: 'en_US', country: 'United States', flag: '🇺🇸' },
  { locale: 'en_GB', country: 'United Kingdom', flag: '🇬🇧' },
  { locale: 'en_CA', country: 'Canada', flag: '🇨🇦' },
  { locale: 'en_AU', country: 'Australia', flag: '🇦🇺' },
  { locale: 'en_IE', country: 'Ireland', flag: '🇮🇪' },
  { locale: 'en_IN', country: 'India', flag: '🇮🇳' },
  { locale: 'en_ZA', country: 'South Africa', flag: '🇿🇦' },
  { locale: 'en_NZ', country: 'New Zealand', flag: '🇳🇿' },
  { locale: 'de_DE', country: 'Germany', flag: '🇩🇪' },
  { locale: 'de_AT', country: 'Austria', flag: '🇦🇹' },
  { locale: 'de_CH', country: 'Switzerland', flag: '🇨🇭' },
  { locale: 'fr_FR', country: 'France', flag: '🇫🇷' },
  { locale: 'fr_BE', country: 'Belgium', flag: '🇧🇪' },
  { locale: 'es_ES', country: 'Spain', flag: '🇪🇸' },
  { locale: 'es_MX', country: 'Mexico', flag: '🇲🇽' },
  { locale: 'es_AR', country: 'Argentina', flag: '🇦🇷' },
  { locale: 'es_CO', country: 'Colombia', flag: '🇨🇴' },
  { locale: 'it_IT', country: 'Italy', flag: '🇮🇹' },
  { locale: 'pt_BR', country: 'Brazil', flag: '🇧🇷' },
  { locale: 'pt_PT', country: 'Portugal', flag: '🇵🇹' },
  { locale: 'nl_NL', country: 'Netherlands', flag: '🇳🇱' },
  { locale: 'sv_SE', country: 'Sweden', flag: '🇸🇪' },
  { locale: 'da_DK', country: 'Denmark', flag: '🇩🇰' },
  { locale: 'nb_NO', country: 'Norway', flag: '🇳🇴' },
  { locale: 'fi_FI', country: 'Finland', flag: '🇫🇮' },
  { locale: 'pl_PL', country: 'Poland', flag: '🇵🇱' },
  { locale: 'tr_TR', country: 'Turkey', flag: '🇹🇷' },
  { locale: 'ja_JP', country: 'Japan', flag: '🇯🇵' },
  { locale: 'ko_KR', country: 'South Korea', flag: '🇰🇷' },
  { locale: 'en_SG', country: 'Singapore', flag: '🇸🇬' },
  { locale: 'en_PH', country: 'Philippines', flag: '🇵🇭' },
  { locale: 'ar_AE', country: 'United Arab Emirates', flag: '🇦🇪' },
];

export const DEFAULT_LOCALE = 'en_US';

const STORAGE_KEY = 'dehub.cinema.locale';

export function isSupportedLocale(locale: string): boolean {
  return CINEMA_LOCALES.some((l) => l.locale === locale);
}

export function localeLabel(locale: string): CinemaLocale {
  return CINEMA_LOCALES.find((l) => l.locale === locale) ?? CINEMA_LOCALES[0];
}

/** i18n key for the country's name, e.g. `cinema.countries.GB`. */
export function countryKey(entry: CinemaLocale): string {
  return `cinema.countries.${entry.locale.split('_')[1]}`;
}

/**
 * Best guess at the viewer's territory: a previous explicit choice, then the
 * device region. Language alone says nothing about which catalogue applies,
 * so only a region counts, and an unmatched region falls back.
 */
export async function detectLocale(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return stored;
  } catch {
    // Storage unavailable; fall through to detection.
  }

  const locales = Localization.getLocales?.() ?? [];
  for (const l of locales) {
    const region = l.regionCode?.toUpperCase();
    if (!region) continue;
    const exact = `${(l.languageCode ?? '').toLowerCase()}_${region}`;
    if (isSupportedLocale(exact)) return exact;
    const byRegion = CINEMA_LOCALES.find((c) => c.locale.endsWith(`_${region}`));
    if (byRegion) return byRegion.locale;
  }
  return DEFAULT_LOCALE;
}

export function rememberLocale(locale: string): void {
  AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => {});
}
