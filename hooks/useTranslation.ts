import { useState, useCallback, useRef, useMemo } from 'react';
import { translateText, getDeviceLanguage } from '../services/translation.service';
import { toastLoading, toastSuccess, toastError, dismissToast } from '../libs';

interface UseTranslationResult {
  isTranslated: boolean;
  translatedTexts: Record<string, string>;
  isLoading: boolean;
  handleTranslate: () => void;
  handleShowOriginal: () => void;
  shouldShow: boolean;
}

const deviceLang = getDeviceLanguage();
const MIN_TRANSLATABLE_LENGTH = 20;

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f]/gu;
function stripEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, '').replace(/\s+/g, ' ').trim();
}

/**
 * Hook for on-demand translation of one or more text fields.
 * @param texts - Record of key→original text (e.g. { title: "Hola", description: "Mundo" })
 * @param detectedLanguage - ISO 639-1 code from the backend (e.g. "es"), or "und"/undefined to hide button
 */
export function useTranslation(
  texts: Record<string, string>,
  detectedLanguage?: string | null,
): UseTranslationResult {
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef(false);

  const hasEnoughText = useMemo(() => {
    const combined = Object.values(texts).join(' ');
    return stripEmojis(combined).length >= MIN_TRANSLATABLE_LENGTH;
  }, [texts]);

  const shouldShow =
    !!detectedLanguage &&
    detectedLanguage !== 'und' &&
    detectedLanguage !== deviceLang &&
    hasEnoughText;

  const handleTranslate = useCallback(async () => {
    if (debounceRef.current || isTranslated) return;
    debounceRef.current = true;
    setIsLoading(true);

    const toastId = toastLoading("Translating...");
    try {
      const entries = Object.entries(texts).filter(([, v]) => v && v.trim().length > 0);
      const results = await Promise.all(
        entries.map(async ([key, text]) => {
          const { translatedText } = await translateText(text, deviceLang, detectedLanguage || 'auto');
          return [key, translatedText] as const;
        }),
      );
      setTranslatedTexts(Object.fromEntries(results));
      setIsTranslated(true);
      dismissToast(toastId);
      toastSuccess("Post translated");
    } catch {
      dismissToast(toastId);
      toastError("Translation failed. Please try again.");
    } finally {
      setIsLoading(false);
      debounceRef.current = false;
    }
  }, [texts, detectedLanguage, isTranslated]);

  const handleShowOriginal = useCallback(() => {
    setIsTranslated(false);
  }, []);

  return { isTranslated, translatedTexts, isLoading, handleTranslate, handleShowOriginal, shouldShow };
}
