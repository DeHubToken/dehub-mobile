import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { translateText, getUserLanguage } from '../services/translation.service';
import { autoTranslateEnabled } from '../libs/auto-translate-setting';
import { queueAutoTranslate } from '../libs/auto-translate-queue';
import { toastLoading, toastSuccess, toastError, dismissToast } from '../libs';

interface UseTranslationResult {
  isTranslated: boolean;
  translatedTexts: Record<string, string>;
  isLoading: boolean;
  handleTranslate: () => void;
  handleShowOriginal: () => void;
  shouldShow: boolean;
}

// Matches web (MIN_TEXT_LENGTH_FOR_TRANSLATION), so the same post offers the
// same button on both platforms. Emoji are stripped before this is measured,
// so an emoji-only post still counts as empty and gets no button.
const MIN_TRANSLATABLE_LENGTH = 1;

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f]/gu;
function stripEmojis(text: string): string {
  return text.replace(EMOJI_REGEX, '').replace(/\s+/g, ' ').trim();
}

/** "pt-BR" and "pt" are the same language for the purpose of skipping work. */
function baseLang(lang: string): string {
  return lang.split(/[-_]/)[0].toLowerCase();
}

/**
 * Hook for translation of one or more text fields.
 *
 * Public content translates itself: the reader who cannot read the post is the
 * failure this removes, and asking them to press a button in a language they do
 * not read to find out what the post says is not much of an offer. Web has
 * worked this way since the auto-translate rollout; this brings the app in line.
 *
 * @param texts - Record of key→original text (e.g. { title: "Hola", description: "Mundo" })
 * @param detectedLanguage - ISO 639-1 code from the backend (e.g. "es"), or "und"/undefined when unknown
 * @param auto - Translate without being asked. Public content should; private
 *   content must not. Translating sends the body to a third party, and the free
 *   tier is MyMemory — a SHARED translation memory, which is why an unrelated
 *   segment somebody else once submitted can come back out of it. A reader
 *   choosing to translate one message accepts that; doing it silently to every
 *   message they receive does not, and a direct message is not ours to upload
 *   on their behalf.
 */
export function useTranslation(
  texts: Record<string, string>,
  detectedLanguage?: string | null,
  auto: boolean = true,
): UseTranslationResult {
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  // The source language as the server reported it, for posts the backend never
  // labelled. Without this an auto-translated legacy post would show no control
  // at all, leaving the reader no way back to the original.
  const [resolvedLang, setResolvedLang] = useState<string | null>(null);

  // Whether a request is out, tracked in a ref rather than read off `isLoading`.
  // The state value is a snapshot of the render the callback was created in, so
  // guarding on it would reject any second call made before React re-renders —
  // including the one auto-translate makes when the reader's language resolves
  // a beat after mount.
  const inFlightRef = useRef(false);
  const isTranslatedRef = useRef(false);

  // Guards a late response against a card the FlatList has already recycled.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribing to i18n re-runs this hook when the user switches language in
  // Settings, so the translation follows the new language without an app
  // restart.
  const { i18n } = useI18n();
  const targetLang = useMemo(() => getUserLanguage(), [i18n.language]);

  const hasEnoughText = useMemo(() => {
    const combined = Object.values(texts).join(' ');
    return stripEmojis(combined).length >= MIN_TRANSLATABLE_LENGTH;
  }, [texts]);

  const knownLang = detectedLanguage || resolvedLang;

  // Shown once there is a translation to toggle, or once we know the post is in
  // a language the reader did not pick. `isTranslated` is checked first because
  // auto-translate can get there on a post the backend never labelled.
  const shouldShow =
    hasEnoughText &&
    (isTranslated ||
      (!!knownLang && knownLang !== 'und' && baseLang(knownLang) !== baseLang(targetLang)));

  /**
   * @param silent - auto-translation, which the reader did not ask for and must
   *   not be narrated at them: no toasts, and no "Translating…" on a card they
   *   were only scrolling past.
   */
  const runTranslate = useCallback(
    async (silent: boolean) => {
      if (inFlightRef.current || isTranslatedRef.current) return;
      inFlightRef.current = true;
      if (!silent) setIsLoading(true);

      const toastId = silent ? null : toastLoading('Translating...');
      try {
        // "und" is the backend saying it could not tell, not a language. Passed
        // through it becomes a `und|tr` language pair at the provider, which
        // MyMemory answers with a segment out of its shared memory rather than
        // an error — a stranger's sentence, rendered as this post's translation.
        const source = !detectedLanguage || detectedLanguage === 'und' ? 'auto' : detectedLanguage;
        const entries = Object.entries(texts).filter(([, v]) => v && v.trim().length > 0);
        const results = await Promise.all(
          entries.map(async ([key, text]) => {
            const result = await translateText(text, targetLang, source);
            return [key, result] as const;
          }),
        );

        const translations = Object.fromEntries(
          results.map(([key, result]) => [key, result.translatedText] as const),
        );
        // The server returns the body untouched when it is already in the
        // target language. Flipping to the translated state on that would put a
        // "Show original" control on a change that never happened — on a feed
        // whose posts match the reader's language, which is most of them, every
        // post would look translated and none of them would be.
        const changedSomething = results.some(([, result]) => !result.sameLanguage);
        const detected = results.find(([, result]) => result.sourceLang)?.[1].sourceLang ?? null;

        // The mount check guards the state writes only. Resolving the toast has
        // to happen either way: a reader who scrolls on while the request is out
        // would otherwise be left with a "Translating…" toast that never clears.
        if (detected && mountedRef.current) setResolvedLang(detected);

        if (!changedSomething) {
          // A settled answer, not a failure. Nothing to show and nothing to
          // apologise for — but say so when the reader asked, or the button
          // looks broken.
          if (toastId !== null) {
            dismissToast(toastId);
            toastSuccess('Already in your language');
          }
          return;
        }

        if (mountedRef.current) {
          setTranslatedTexts(translations);
          isTranslatedRef.current = true;
          setIsTranslated(true);
        }
        if (toastId !== null) {
          dismissToast(toastId);
          toastSuccess('Post translated');
        }
      } catch {
        if (toastId !== null) {
          dismissToast(toastId);
          toastError('Translation failed. Please try again.');
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current && !silent) setIsLoading(false);
      }
    },
    [texts, detectedLanguage, targetLang],
  );

  const handleTranslate = useCallback(() => {
    void runTranslate(false);
  }, [runTranslate]);

  const handleShowOriginal = useCallback(() => {
    isTranslatedRef.current = false;
    setIsTranslated(false);
  }, []);

  // Auto-translate.
  //
  // Deferred, never immediate: the work is queued behind the interactions in
  // flight and run a few at a time (see queueAutoTranslate). The reader gets
  // the feed first and the translation a moment later, instead of the feed
  // waiting behind a burst of translate calls nobody asked for.
  //
  // Fires once per (text, language) rather than per render, and a reader who
  // has pressed "show original" is not overridden — autoDone is set before the
  // work is queued, so the manual controls stay exactly as they were.
  const combinedText = useMemo(() => Object.values(texts).join(' '), [texts]);
  const autoDoneRef = useRef<string | null>(null);
  const runRef = useRef(runTranslate);
  useEffect(() => {
    runRef.current = runTranslate;
  }, [runTranslate]);

  useEffect(() => {
    if (!auto) return;
    if (!autoTranslateEnabled()) return;
    if (!hasEnoughText) return;
    // Nothing to do when the backend has already labelled the post as being in
    // the reader's language. The edge function would answer `sameLanguage` to
    // the same effect, but not asking is cheaper than being told — and on a
    // feed whose majority language matches the reader, this is most of it.
    if (detectedLanguage && baseLang(detectedLanguage) === baseLang(targetLang)) return;

    const key = `${combinedText}::${targetLang}`;
    if (autoDoneRef.current === key) return;
    autoDoneRef.current = key;

    return queueAutoTranslate(() => runRef.current(true));
  }, [combinedText, targetLang, hasEnoughText, auto, detectedLanguage]);

  return { isTranslated, translatedTexts, isLoading, handleTranslate, handleShowOriginal, shouldShow };
}
