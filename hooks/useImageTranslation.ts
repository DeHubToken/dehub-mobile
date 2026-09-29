import { useState, useCallback, useRef } from 'react';
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
  // Which request is current. Starting another or clearing the result moves it
  // on, so an answer that arrives after the sheet was closed (or after its card
  // moved on to another post) is dropped instead of showing up next time.
  const reqRef = useRef(0);

  const translateImage = useCallback(async (imageUrl: string) => {
    const id = ++reqRef.current;
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
      // An earlier request no longer clears the spinner itself.
      setIsLoading(false);
      return cached;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await translateImageFn(imageUrl, lang);
      cache.set(key, res);
      if (id === reqRef.current) setResult(res);
      return res;
    } catch (err) {
      if (id === reqRef.current) setError(err instanceof Error ? err.message : 'Image translation failed');
      return null;
    } finally {
      if (id === reqRef.current) setIsLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    reqRef.current += 1;
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { isLoading, error, result, translateImage, clearResult };
}
