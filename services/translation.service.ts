import { NativeModules, Platform } from 'react-native';
import { createLogger } from '../libs/logger';
import i18n from '../i18n';
import { supabase } from './supabase';

const log = createLogger('translation.service');

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

/**
 * The language translations should target: what the user picked in Settings
 * (persisted as `user-preferred-language` and applied to i18n), falling back to
 * the device locale only when no choice has been made.
 *
 * Never read the device locale on its own for this — a user running an
 * English phone with DeHub set to Turkish would get English "translations",
 * and posts already in English would be judged same-language and lose their
 * translate button entirely. Call this at use time, not at module scope: the
 * language can change mid-session from the Settings picker.
 */
export function getUserLanguage(): string {
  const chosen = i18n?.language;
  if (chosen) {
    const normalized = chosen.split(/[-_]/)[0].toLowerCase();
    if (normalized) return normalized;
  }
  return getDeviceLanguage();
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

  log.debug('Translating text', { targetLang, sourceLang, length: text.length });

  const { data, error } = await supabase.functions.invoke('translate-text', {
    body: { text, targetLang, sourceLang } satisfies TranslateRequest,
  });

  if (error) {
    log.error('translate-text failed:', error);
    throw new TranslationServiceError(error.message || 'Translation failed', 500);
  }

  if (!data?.translatedText) {
    throw new TranslationServiceError('Translation unavailable', 500);
  }

  const detectedLang = (data as TranslateResponse).detectedLanguage?.language ?? null;

  setCache(text, targetLang, {
    translatedText: data.translatedText,
    sourceLang: detectedLang,
  });

  return { translatedText: data.translatedText, sourceLang: detectedLang };
}

export interface ImageTranslateResponse {
  extractedText: string;
  translatedText: string;
  sourceLang: string;
  hasText: boolean;
}

export async function translateImage(
  imageUrl: string,
  targetLang: string,
): Promise<ImageTranslateResponse> {
  const { data, error } = await supabase.functions.invoke('translate-image', {
    body: { imageUrl, targetLang },
  });

  if (error) {
    log.error('translate-image failed:', error);
    throw new TranslationServiceError(error.message || 'Image translation failed', 500);
  }

  if (data?.error) {
    throw new TranslationServiceError(data.error, 500);
  }

  return {
    extractedText: data.extractedText || '',
    translatedText: data.translatedText || '',
    sourceLang: data.sourceLang || '',
    hasText: data.hasText ?? false,
  };
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
