/**
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
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'dcc', name: 'Deccan', nativeName: 'دکنی' },
  { code: 'dyu', name: 'Jula', nativeName: 'Julakan' },
  { code: 'om', name: 'Oromo', nativeName: 'Afaan Oromoo' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'acm', name: 'Arabic, Mesopotamian Spoken', nativeName: 'عراقي' },
  { code: 'acw', name: 'Arabic, Hijazi Spoken', nativeName: 'حجازي' },
  { code: 'aec', name: "Arabic, Sa'idi Spoken", nativeName: 'صعيدي' },
  { code: 'ajp', name: 'Arabic, South Levantine Spoken', nativeName: 'شامي' },
  { code: 'ayn', name: 'Arabic, Sanaani Spoken', nativeName: 'صنعاني' },
  { code: 'apd', name: 'Arabic, Sudanese Spoken', nativeName: 'عربي سوداني' },
  { code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'cjy', name: 'Chinese, Jinyu', nativeName: '晋语' },
  { code: 'mnp', name: 'Chinese, Min Bei', nativeName: '闽北语' },
  { code: 'ctg', name: 'Chittagonian', nativeName: 'চাটগাঁইয়া' },
  { code: 'hne', name: 'Chhattisgarhi', nativeName: 'छत्तीसगढ़ी' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'arz', name: 'Egyptian Arabic', nativeName: 'مصرى' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'gsw', name: 'Swiss German', nativeName: 'Schwyzerdütsch' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша' },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ' },
  { code: 'mag', name: 'Magahi', nativeName: 'मगही' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'yue', name: 'Cantonese', nativeName: '廣東話' },
  { code: 'wuu', name: 'Wu Chinese', nativeName: '吴语' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'ary', name: 'Moroccan Arabic', nativeName: 'الدارجة' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'pcm', name: 'Nigerian Pidgin', nativeName: 'Naijá' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'wes', name: 'Pidgin, Cameroon', nativeName: 'Kamtok' },
  { code: 'pbt', name: 'Pashto, Southern', nativeName: 'پښتو' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'qu', name: 'Quechua', nativeName: 'Runasimi' },
  { code: 'rkt', name: 'Rangpuri', nativeName: 'রংপুরী' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'sdr', name: 'Sadri', nativeName: 'سدری' },
  { code: 'skr', name: 'Saraiki', nativeName: 'سرائیکی' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'syl', name: 'Sylheti', nativeName: 'ꠍꠤꠟꠐꠤ' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'tts', name: 'Thai, Northeastern', nativeName: 'อีสาน' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
  { code: 'ti', name: 'Tigrinya', nativeName: 'ትግርኛ' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'mi', name: 'Maori', nativeName: 'Māori' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'ug', name: 'Uyghur', nativeName: 'ئۇيغۇرچە' },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ' },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmen' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча' }
];

// Lazy-loaders for all non-English locales
const localeLoaders: Record<string, () => Record<string, unknown>> = {
  da: () => require('./locales/da.json'),
  dcc: () => require('./locales/dcc.json'),
  dyu: () => require('./locales/dyu.json'),
  om: () => require('./locales/om.json'),
  af: () => require('./locales/af.json'),
  az: () => require('./locales/az.json'),
  am: () => require('./locales/am.json'),
  ar: () => require('./locales/ar.json'),
  acm: () => require('./locales/acm.json'),
  acw: () => require('./locales/acw.json'),
  aec: () => require('./locales/aec.json'),
  ajp: () => require('./locales/ajp.json'),
  ayn: () => require('./locales/ayn.json'),
  apd: () => require('./locales/apd.json'),
  bho: () => require('./locales/bho.json'),
  be: () => require('./locales/be.json'),
  bn: () => require('./locales/bn.json'),
  bg: () => require('./locales/bg.json'),
  my: () => require('./locales/my.json'),
  cs: () => require('./locales/cs.json'),
  zh: () => require('./locales/zh.json'),
  cjy: () => require('./locales/cjy.json'),
  mnp: () => require('./locales/mnp.json'),
  ctg: () => require('./locales/ctg.json'),
  hne: () => require('./locales/hne.json'),
  nl: () => require('./locales/nl.json'),
  arz: () => require('./locales/arz.json'),
  fr: () => require('./locales/fr.json'),
  de: () => require('./locales/de.json'),
  el: () => require('./locales/el.json'),
  gsw: () => require('./locales/gsw.json'),
  ha: () => require('./locales/ha.json'),
  he: () => require('./locales/he.json'),
  ka: () => require('./locales/ka.json'),
  hi: () => require('./locales/hi.json'),
  hr: () => require('./locales/hr.json'),
  hu: () => require('./locales/hu.json'),
  ig: () => require('./locales/ig.json'),
  id: () => require('./locales/id.json'),
  it: () => require('./locales/it.json'),
  ja: () => require('./locales/ja.json'),
  jv: () => require('./locales/jv.json'),
  kk: () => require('./locales/kk.json'),
  ku: () => require('./locales/ku.json'),
  kn: () => require('./locales/kn.json'),
  ko: () => require('./locales/ko.json'),
  lo: () => require('./locales/lo.json'),
  mag: () => require('./locales/mag.json'),
  mr: () => require('./locales/mr.json'),
  mn: () => require('./locales/mn.json'),
  mg: () => require('./locales/mg.json'),
  yue: () => require('./locales/yue.json'),
  wuu: () => require('./locales/wuu.json'),
  ms: () => require('./locales/ms.json'),
  ary: () => require('./locales/ary.json'),
  km: () => require('./locales/km.json'),
  ne: () => require('./locales/ne.json'),
  pcm: () => require('./locales/pcm.json'),
  fa: () => require('./locales/fa.json'),
  wes: () => require('./locales/wes.json'),
  pbt: () => require('./locales/pbt.json'),
  pa: () => require('./locales/pa.json'),
  pl: () => require('./locales/pl.json'),
  pt: () => require('./locales/pt.json'),
  qu: () => require('./locales/qu.json'),
  rkt: () => require('./locales/rkt.json'),
  ro: () => require('./locales/ro.json'),
  ru: () => require('./locales/ru.json'),
  sdr: () => require('./locales/sdr.json'),
  skr: () => require('./locales/skr.json'),
  es: () => require('./locales/es.json'),
  sr: () => require('./locales/sr.json'),
  si: () => require('./locales/si.json'),
  so: () => require('./locales/so.json'),
  sk: () => require('./locales/sk.json'),
  sv: () => require('./locales/sv.json'),
  sw: () => require('./locales/sw.json'),
  syl: () => require('./locales/syl.json'),
  tl: () => require('./locales/tl.json'),
  ta: () => require('./locales/ta.json'),
  te: () => require('./locales/te.json'),
  th: () => require('./locales/th.json'),
  tts: () => require('./locales/tts.json'),
  tr: () => require('./locales/tr.json'),
  uk: () => require('./locales/uk.json'),
  ur: () => require('./locales/ur.json'),
  uz: () => require('./locales/uz.json'),
  vi: () => require('./locales/vi.json'),
  sa: () => require('./locales/sa.json'),
  yo: () => require('./locales/yo.json'),
  no: () => require('./locales/no.json'),
  fi: () => require('./locales/fi.json'),
  zu: () => require('./locales/zu.json'),
  ti: () => require('./locales/ti.json'),
  ca: () => require('./locales/ca.json'),
  lt: () => require('./locales/lt.json'),
  et: () => require('./locales/et.json'),
  lv: () => require('./locales/lv.json'),
  mi: () => require('./locales/mi.json'),
  gu: () => require('./locales/gu.json'),
  ml: () => require('./locales/ml.json'),
  or: () => require('./locales/or.json'),
  sd: () => require('./locales/sd.json'),
  sq: () => require('./locales/sq.json'),
  ug: () => require('./locales/ug.json'),
  tg: () => require('./locales/tg.json'),
  tk: () => require('./locales/tk.json'),
  hy: () => require('./locales/hy.json'),
  ky: () => require('./locales/ky.json')
};

/**
 * Load a locale's translations. Returns true if loaded (or already loaded).
 */
export async function loadLanguage(lang: string): Promise<boolean> {
  if (lang === 'en') return true;
  if (i18n.hasResourceBundle(lang, 'translation')) return true;

  const loader = localeLoaders[lang];
  if (!loader) {
    console.warn(`[i18n] No loader for locale "${lang}"`);
    return false;
  }

  try {
    const module = loader();
    i18n.addResourceBundle(lang, 'translation', module, true, true);
    return true;
  } catch (err) {
    console.warn(`[i18n] Failed to load locale "${lang}"`, err);
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
