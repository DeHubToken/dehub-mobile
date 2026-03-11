import { NativeModules, Platform } from 'react-native';
import env from '../config/env';
import { createLogger } from '../libs/logger';

const log = createLogger('translation.service');

const EDGE_BASE = env.SUPABASE_EDGE_BASE_URL;

export interface TranslateRequest {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

export interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: {
    language: string;
    confidence: number;
  };
}

/** Error from the translation endpoint. */
export interface TranslateError {
  error: string;
  status: number;
}

const MAX_CACHE = 200;

interface CacheEntry {
  translatedText: string;
  sourceLang: string | null;
}

/** Simple LRU cache backed by a Map (insertion order). */
const cache = new Map<string, CacheEntry>();

function cacheKey(text: string, targetLang: string): string {
  return `${text.slice(0, 200)}::${targetLang}`;
}

function getCached(text: string, targetLang: string): CacheEntry | undefined {
  const key = cacheKey(text, targetLang);
  const entry = cache.get(key);
  if (entry) {
    cache.delete(key);
    cache.set(key, entry);
  }
  return entry;
}

function setCache(text: string, targetLang: string, entry: CacheEntry): void {
  const key = cacheKey(text, targetLang);
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, entry);
}

export function getDeviceLanguage(): string {
  try {
    let locale: string | undefined;
    if (Platform.OS === 'ios') {
      locale =
        NativeModules.SettingsManager?.settings?.AppleLocale ??
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier;
    }
    if (locale) return locale.split(/[-_]/)[0].toLowerCase();
  } catch {
    // ignore
  }
  return 'en';
}

export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'auto',
): Promise<{ translatedText: string; sourceLang: string | null }> {
  if (!text || text.trim().length < 1) {
    return { translatedText: text, sourceLang: null };
  }

  const cached = getCached(text, targetLang);
  if (cached) {
    log.debug('Cache hit for translation');
    return { translatedText: cached.translatedText, sourceLang: cached.sourceLang };
  }

  const url = `${EDGE_BASE}/translate-text`;
  log.debug('Translating text', { targetLang, sourceLang, length: text.length });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLang, sourceLang } satisfies TranslateRequest),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Translation failed' }));
    log.error(`translate-text failed (${res.status}):`, errData.error);
    throw new TranslationServiceError(errData.error || 'Translation failed', res.status);
  }

  const data: TranslateResponse = await res.json();
  const detectedLang = data.detectedLanguage?.language ?? null;

  setCache(text, targetLang, {
    translatedText: data.translatedText,
    sourceLang: detectedLang,
  });

  return { translatedText: data.translatedText, sourceLang: detectedLang };
}

export class TranslationServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TranslationServiceError';
    this.status = status;
  }
}

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  id: 'Indonesian',
  pl: 'Polish',
  uk: 'Ukrainian',
  tl: 'Tagalog',
  ar: 'Arabic',
  hi: 'Hindi',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  th: 'Thai',
  vi: 'Vietnamese',
  ms: 'Malay',
  nl: 'Dutch',
  ro: 'Romanian',
  sw: 'Swahili',
  pcm: 'Nigerian Pidgin',
  arz: 'Egyptian Arabic',
  ary: 'Moroccan Arabic',
  ha: 'Hausa',
};
