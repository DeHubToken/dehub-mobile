import { useState, useCallback } from 'react';
import {
  translateImage as translateImageFn,
  type ImageTranslateResponse,
  getUserLanguage,
} from '../services/translation.service';

const cache = new Map<string, ImageTranslateResponse>();

function cacheKey(imageUrl: string, lang: string): string {
  return `${imageUrl.slice(-60)}::${lang}`;
}

export function useImageTranslation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageTranslateResponse | null>(null);

  const translateImage = useCallback(async (imageUrl: string) => {
    // Resolved per call, not once at import: the language is settled from
    // storage after boot and can change from the Settings picker. Reading it
    // at module scope pinned every OCR translation to the startup default
    // ("en"), which is why the sheet kept returning the untranslated original.
    const lang = getUserLanguage();
    const key = cacheKey(imageUrl, lang);
    const cached = cache.get(key);
    if (cached) {
      setResult(cached);
      setError(null);
      return cached;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await translateImageFn(imageUrl, lang);
      cache.set(key, res);
      setResult(res);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image translation failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { isLoading, error, result, translateImage, clearResult };
}
