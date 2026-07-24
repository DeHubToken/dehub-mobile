import { useState, useCallback } from 'react';
import {
  translateImage as translateImageFn,
  type ImageTranslateResponse,
  getDeviceLanguage,
} from '../services/translation.service';

const deviceLang = getDeviceLanguage();

const cache = new Map<string, ImageTranslateResponse>();

function cacheKey(imageUrl: string, lang: string): string {
  return `${imageUrl.slice(-60)}::${lang}`;
}

export function useImageTranslation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageTranslateResponse | null>(null);

  const translateImage = useCallback(async (imageUrl: string) => {
    const key = cacheKey(imageUrl, deviceLang);
    const cached = cache.get(key);
    if (cached) {
      setResult(cached);
      setError(null);
      return cached;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await translateImageFn(imageUrl, deviceLang);
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
