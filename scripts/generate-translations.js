/**
 * generate-translations.js
 *
 * Copies and completes translation files from the web app (cosmic-echo-hero-main)
 * into the mobile app's i18n/locales/ directory for ALL supported languages.
 *
 * For each locale:
 *   1. Reads the web app's existing translation JSON (if it exists)
 *   2. Deep-merges with en.json as fallback for any missing keys
 *   3. Writes the completed file to mobile i18n/locales/{code}.json
 *
 * Also generates the i18n config (index.ts) for the mobile app.
 *
 * Usage: node scripts/generate-translations.js
 */

const fs = require('fs');
const path = require('path');

const WEB_LOCALES_DIR = path.resolve(__dirname, '..', 'cosmic-echo-hero-main', 'src', 'i18n', 'locales');
const MOBILE_I18N_DIR = path.resolve(__dirname, '..', 'i18n');
const MOBILE_LOCALES_DIR = path.join(MOBILE_I18N_DIR, 'locales');

// All 111 languages supported by the web app (from SUPPORTED_LANGUAGES in index.ts)
const ALL_LOCALES = [
  { code: 'en',  name: 'English',                      nativeName: 'English' },
  { code: 'da',  name: 'Danish',                       nativeName: 'Dansk' },
  { code: 'dcc', name: 'Deccan',                       nativeName: 'دکنی' },
  { code: 'dyu', name: 'Jula',                         nativeName: 'Julakan' },
  { code: 'om',  name: 'Oromo',                        nativeName: 'Afaan Oromoo' },
  { code: 'af',  name: 'Afrikaans',                    nativeName: 'Afrikaans' },
  { code: 'az',  name: 'Azerbaijani',                  nativeName: 'Azərbaycan' },
  { code: 'am',  name: 'Amharic',                      nativeName: 'አማርኛ' },
  { code: 'ar',  name: 'Arabic',                       nativeName: 'العربية' },
  { code: 'acm', name: 'Arabic, Mesopotamian Spoken',  nativeName: 'عراقي' },
  { code: 'acw', name: 'Arabic, Hijazi Spoken',        nativeName: 'حجازي' },
  { code: 'aec', name: "Arabic, Sa'idi Spoken",        nativeName: 'صعيدي' },
  { code: 'ajp', name: 'Arabic, South Levantine Spoken',nativeName: 'شامي' },
  { code: 'ayn', name: 'Arabic, Sanaani Spoken',       nativeName: 'صنعاني' },
  { code: 'apd', name: 'Arabic, Sudanese Spoken',      nativeName: 'عربي سوداني' },
  { code: 'bho', name: 'Bhojpuri',                     nativeName: 'भोजपुरी' },
  { code: 'be',  name: 'Belarusian',                   nativeName: 'Беларуская' },
  { code: 'bn',  name: 'Bengali',                      nativeName: 'বাংলা' },
  { code: 'bg',  name: 'Bulgarian',                    nativeName: 'Български' },
  { code: 'my',  name: 'Burmese',                      nativeName: 'မြန်မာ' },
  { code: 'cs',  name: 'Czech',                        nativeName: 'Čeština' },
  { code: 'zh',  name: 'Chinese',                      nativeName: '中文' },
  { code: 'cjy', name: 'Chinese, Jinyu',               nativeName: '晋语' },
  { code: 'mnp', name: 'Chinese, Min Bei',             nativeName: '闽北语' },
  { code: 'ctg', name: 'Chittagonian',                 nativeName: 'চাটগাঁইয়া' },
  { code: 'hne', name: 'Chhattisgarhi',                nativeName: 'छत्तीसगढ़ी' },
  { code: 'nl',  name: 'Dutch',                        nativeName: 'Nederlands' },
  { code: 'arz', name: 'Egyptian Arabic',              nativeName: 'مصرى' },
  { code: 'fr',  name: 'French',                       nativeName: 'Français' },
  { code: 'de',  name: 'German',                       nativeName: 'Deutsch' },
  { code: 'el',  name: 'Greek',                        nativeName: 'Ελληνικά' },
  { code: 'gsw', name: 'Swiss German',                 nativeName: 'Schwyzerdütsch' },
  { code: 'ha',  name: 'Hausa',                        nativeName: 'Hausa' },
  { code: 'he',  name: 'Hebrew',                       nativeName: 'עברית' },
  { code: 'ka',  name: 'Georgian',                     nativeName: 'ქართული' },
  { code: 'hi',  name: 'Hindi',                        nativeName: 'हिन्दी' },
  { code: 'hr',  name: 'Croatian',                     nativeName: 'Hrvatski' },
  { code: 'hu',  name: 'Hungarian',                    nativeName: 'Magyar' },
  { code: 'ig',  name: 'Igbo',                         nativeName: 'Igbo' },
  { code: 'id',  name: 'Indonesian',                   nativeName: 'Bahasa Indonesia' },
  { code: 'it',  name: 'Italian',                      nativeName: 'Italiano' },
  { code: 'ja',  name: 'Japanese',                     nativeName: '日本語' },
  { code: 'jv',  name: 'Javanese',                     nativeName: 'Basa Jawa' },
  { code: 'kk',  name: 'Kazakh',                       nativeName: 'Қазақша' },
  { code: 'ku',  name: 'Kurdish',                      nativeName: 'Kurdî' },
  { code: 'kn',  name: 'Kannada',                      nativeName: 'ಕನ್ನಡ' },
  { code: 'ko',  name: 'Korean',                       nativeName: '한국어' },
  { code: 'lo',  name: 'Lao',                          nativeName: 'ລາວ' },
  { code: 'mag', name: 'Magahi',                       nativeName: 'मगही' },
  { code: 'mr',  name: 'Marathi',                      nativeName: 'मराठी' },
  { code: 'mn',  name: 'Mongolian',                    nativeName: 'Монгол' },
  { code: 'mg',  name: 'Malagasy',                     nativeName: 'Malagasy' },
  { code: 'yue', name: 'Cantonese',                    nativeName: '廣東話' },
  { code: 'wuu', name: 'Wu Chinese',                   nativeName: '吴语' },
  { code: 'ms',  name: 'Malay',                        nativeName: 'Bahasa Melayu' },
  { code: 'ary', name: 'Moroccan Arabic',              nativeName: 'الدارجة' },
  { code: 'km',  name: 'Khmer',                        nativeName: 'ខ្មែរ' },
  { code: 'ne',  name: 'Nepali',                       nativeName: 'नेपाली' },
  { code: 'pcm', name: 'Nigerian Pidgin',              nativeName: 'Naijá' },
  { code: 'fa',  name: 'Persian',                      nativeName: 'فارسی' },
  { code: 'wes', name: 'Pidgin, Cameroon',             nativeName: 'Kamtok' },
  { code: 'pbt', name: 'Pashto, Southern',             nativeName: 'پښتو' },
  { code: 'pa',  name: 'Punjabi',                      nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'pl',  name: 'Polish',                       nativeName: 'Polski' },
  { code: 'pt',  name: 'Portuguese',                   nativeName: 'Português' },
  { code: 'qu',  name: 'Quechua',                      nativeName: 'Runasimi' },
  { code: 'rkt', name: 'Rangpuri',                     nativeName: 'রংপুরী' },
  { code: 'ro',  name: 'Romanian',                     nativeName: 'Română' },
  { code: 'ru',  name: 'Russian',                      nativeName: 'Русский' },
  { code: 'sdr', name: 'Sadri',                        nativeName: 'سدری' },
  { code: 'skr', name: 'Saraiki',                      nativeName: 'سرائیکی' },
  { code: 'es',  name: 'Spanish',                      nativeName: 'Español' },
  { code: 'sr',  name: 'Serbian',                      nativeName: 'Српски' },
  { code: 'si',  name: 'Sinhala',                      nativeName: 'සිංහල' },
  { code: 'so',  name: 'Somali',                       nativeName: 'Soomaali' },
  { code: 'sk',  name: 'Slovak',                       nativeName: 'Slovenčina' },
  { code: 'sv',  name: 'Swedish',                      nativeName: 'Svenska' },
  { code: 'sw',  name: 'Swahili',                      nativeName: 'Kiswahili' },
  { code: 'syl', name: 'Sylheti',                      nativeName: 'ꠍꠤꠟꠐꠤ' },
  { code: 'tl',  name: 'Tagalog',                      nativeName: 'Tagalog' },
  { code: 'ta',  name: 'Tamil',                        nativeName: 'தமிழ்' },
  { code: 'te',  name: 'Telugu',                       nativeName: 'తెలుగు' },
  { code: 'th',  name: 'Thai',                         nativeName: 'ไทย' },
  { code: 'tts', name: 'Thai, Northeastern',           nativeName: 'อีสาน' },
  { code: 'tr',  name: 'Turkish',                      nativeName: 'Türkçe' },
  { code: 'uk',  name: 'Ukrainian',                    nativeName: 'Українська' },
  { code: 'ur',  name: 'Urdu',                         nativeName: 'اردو' },
  { code: 'uz',  name: 'Uzbek',                        nativeName: 'Oʻzbek' },
  { code: 'vi',  name: 'Vietnamese',                   nativeName: 'Tiếng Việt' },
  { code: 'sa',  name: 'Sanskrit',                     nativeName: 'संस्कृतम्' },
  { code: 'yo',  name: 'Yoruba',                       nativeName: 'Yorùbá' },
  { code: 'no',  name: 'Norwegian',                    nativeName: 'Norsk' },
  { code: 'fi',  name: 'Finnish',                      nativeName: 'Suomi' },
  { code: 'zu',  name: 'Zulu',                         nativeName: 'isiZulu' },
  { code: 'ti',  name: 'Tigrinya',                     nativeName: 'ትግርኛ' },
  { code: 'ca',  name: 'Catalan',                      nativeName: 'Català' },
  { code: 'lt',  name: 'Lithuanian',                   nativeName: 'Lietuvių' },
  { code: 'et',  name: 'Estonian',                     nativeName: 'Eesti' },
  { code: 'lv',  name: 'Latvian',                      nativeName: 'Latviešu' },
  { code: 'mi',  name: 'Maori',                        nativeName: 'Māori' },
  { code: 'gu',  name: 'Gujarati',                     nativeName: 'ગુજરાતી' },
  { code: 'ml',  name: 'Malayalam',                    nativeName: 'മലയാളം' },
  { code: 'or',  name: 'Odia',                         nativeName: 'ଓଡ଼ିଆ' },
  { code: 'sd',  name: 'Sindhi',                       nativeName: 'سنڌي' },
  { code: 'sq',  name: 'Albanian',                     nativeName: 'Shqip' },
  { code: 'ug',  name: 'Uyghur',                       nativeName: 'ئۇيغۇرچە' },
  { code: 'tg',  name: 'Tajik',                        nativeName: 'Тоҷикӣ' },
  { code: 'tk',  name: 'Turkmen',                      nativeName: 'Türkmen' },
  { code: 'hy',  name: 'Armenian',                     nativeName: 'Հայերեն' },
  { code: 'ky',  name: 'Kyrgyz',                       nativeName: 'Кыргызча' },
];

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (target[key] === undefined || target[key] === null) {
      result[key] = source[key];
    }
  }
  return result;
}

function countLeafKeys(obj, prefix = '') {
  let count = 0;
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      count += countLeafKeys(obj[key], fullKey);
    } else {
      count++;
    }
  }
  return count;
}

function main() {
  console.log('========================================');
  console.log('  DeHub Mobile — i18n Translation Gen');
  console.log('========================================\n');

  // 1. Load English source
  const enPath = path.join(WEB_LOCALES_DIR, 'en.json');
  if (!fs.existsSync(enPath)) {
    console.error(`ERROR: English source not found at ${enPath}`);
    process.exit(1);
  }
  const enSource = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  const enTotalKeys = countLeafKeys(enSource);
  console.log(`English source: ${enTotalKeys} keys across ${Object.keys(enSource).length} sections\n`);

  // 2. Ensure mobile directories exist
  fs.mkdirSync(MOBILE_LOCALES_DIR, { recursive: true });

  // 3. Process each locale
  let generated = 0;
  let skipped = 0;
  const stats = [];

  for (const locale of ALL_LOCALES) {
    const code = locale.code;
    const webFile = path.join(WEB_LOCALES_DIR, `${code}.json`);
    const mobileFile = path.join(MOBILE_LOCALES_DIR, `${code}.json`);

    let translations;
    let status = '';

    if (code === 'en') {
      // English: just copy directly
      translations = enSource;
      status = 'direct copy';
    } else if (fs.existsSync(webFile)) {
      // Web has translations: merge with English fallback
      try {
        const webTranslations = JSON.parse(fs.readFileSync(webFile, 'utf-8'));
        translations = deepMerge(webTranslations, enSource);
        const webKeys = countLeafKeys(webTranslations);
        const mergedKeys = countLeafKeys(translations);
        const filled = mergedKeys - webKeys;
        status = `merged (${webKeys} web + ${filled} en fallback = ${mergedKeys} total)`;
      } catch (err) {
        console.warn(`  WARN: ${code} — failed to parse web file, using English fallback`);
        translations = enSource;
        status = 'en fallback (parse error)';
      }
    } else {
      // No web translations: use English as placeholder
      translations = enSource;
      status = 'en placeholder (no web file)';
    }

    fs.writeFileSync(mobileFile, JSON.stringify(translations, null, 2), 'utf-8');

    const leafKeys = countLeafKeys(translations);
    stats.push({ code, name: locale.name, nativeName: locale.nativeName, keys: leafKeys, status });

    generated++;
  }

  // 4. Summary report
  console.log(`Generated ${generated} translation files in: ${MOBILE_LOCALES_DIR}\n`);

  // Group by key count for a compact report
  const byKeys = {};
  for (const s of stats) {
    const bucket = s.keys;
    if (!byKeys[bucket]) byKeys[bucket] = [];
    byKeys[bucket].push(s.code);
  }

  console.log('File summary (by key count):');
  for (const [count, codes] of Object.entries(byKeys).sort((a, b) => Number(b[0]) - Number(a[0]))) {
    const pctComplete = ((Number(count) / enTotalKeys) * 100).toFixed(1);
    console.log(`  ${count} keys (${pctComplete}%): ${codes.join(', ')}`);
  }

  // 5. Generate i18n config for mobile
  generateMobileConfig();

  console.log('\nDone!');
}

function generateMobileConfig() {
  const configPath = path.join(MOBILE_I18N_DIR, 'index.ts');

  // Build the SUPPORTED_LANGUAGES array as TypeScript
  const langEntries = ALL_LOCALES.map(
    (l) => `  { code: '${l.code}', name: '${l.name}', nativeName: '${l.nativeName}' }`
  ).join(',\n');

  // Build locale loader entries
  const loaderEntries = ALL_LOCALES
    .filter((l) => l.code !== 'en')
    .map((l) => `  ${l.code}: () => require('./locales/${l.code}.json')`)
    .join(',\n');

  const configContent = `/**
 * i18n Configuration — Mobile (Expo/React Native)
 *
 * English is always bundled. Other languages are lazy-loaded on demand.
 * Works with expo-localization for device locale detection.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';

const STORAGE_KEY = 'user-preferred-language';

// All supported languages (mirrors web app exactly)
export const SUPPORTED_LANGUAGES = [
${langEntries}
];

// Lazy-loaders for all non-English locales
const localeLoaders: Record<string, () => Record<string, unknown>> = {
${loaderEntries}
};

/**
 * Load a locale's translations. Returns true if loaded (or already loaded).
 */
export async function loadLanguage(lang: string): Promise<boolean> {
  if (lang === 'en') return true;
  if (i18n.hasResourceBundle(lang, 'translation')) return true;

  const loader = localeLoaders[lang];
  if (!loader) {
    console.warn(\`[i18n] No loader for locale "\${lang}"\`);
    return false;
  }

  try {
    const module = loader();
    i18n.addResourceBundle(lang, 'translation', module, true, true);
    return true;
  } catch (err) {
    console.warn(\`[i18n] Failed to load locale "\${lang}"\`, err);
    return false;
  }
}

/**
 * Detect the best language from device locale, falling back to stored preference.
 */
export function detectLanguage(): string {
  const locales = Localization.getLocales?.() || [];
  const deviceLang = locales[0]?.languageCode || 'en';
  return deviceLang;
}

// Initialize with English bundled
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

// On startup, switch to saved or device language
(async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    const target = saved || detectLanguage();
    if (target && target !== 'en') {
      const ok = await loadLanguage(target);
      if (ok) {
        await i18n.changeLanguage(target);
      }
    }
  } catch {
    // Silently fall back to English
  }
})();

export default i18n;
`;

  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log(`\nGenerated i18n config: ${configPath}`);
}

main();
