/**
 * Live captions in a stage, listener side
 * =======================================
 * Port of web's useStageCaptionFeed (dehubweb hooks/use-stage-captions.ts).
 * Speakers on web stream their mic to speech-to-text and broadcast each line
 * on `stage-captions:{spaceId}`; this reads those lines, and the server's
 * translations of them, so an app listener sees the same subtitles a web
 * listener does.
 *
 * The chosen language goes out over Realtime presence. That is what the
 * speakers' clients read to decide which languages to translate into, so
 * picking Turkish here is what gets Turkish translated.
 *
 * Broadcasts carry no verified sender, so a line is shown only when its wallet
 * is the host's or a speaker's (the room's current roster).
 *
 * The app does not send captions of its own voice: that needs raw mic audio
 * out of the Agora SDK, which this build does not expose.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { supabase } from "../services/supabase";

export const CAPTION_EVENT = "caption";
export const CAPTION_TRANSLATION_EVENT = "caption-translation";
const FINAL_TTL_MS = 9000;
const INTERIM_TTL_MS = 5000;
const MAX_LINES = 3;
const SOURCE_LANGUAGE = "source";

/** Same list and codes as web; the server holds the same allowlist. */
export const CAPTION_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "ru", name: "Русский" },
  { code: "tr", name: "Türkçe" },
  { code: "id", name: "Bahasa Indonesia" },
];

export interface StageCaptionLine {
  id: string;
  wallet: string;
  name: string;
  text: string;
  final: boolean;
  at: number;
  translations?: Record<string, string>;
}

// ── Viewer prefs (show + language), shared by every caption surface ─────────
const SHOW_KEY = "dehub.stage.captions.show";
const LANG_KEY = "dehub.stage.captions.lang";
let show = true;
const validLanguage = (value: string | null | undefined): value is string =>
  !!value && CAPTION_LANGUAGES.some((option) => option.code === value);
const uiLanguage = () => {
  const code = (i18n.language || "").split(/[-_]/)[0].toLowerCase();
  return validLanguage(code) ? code : null;
};
let pickedLanguage: string | null | undefined;
let language: string | null = uiLanguage();
let showPicked = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((cb) => cb());
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
};
AsyncStorage.multiGet([SHOW_KEY, LANG_KEY])
  .then(([[, s], [, l]]) => {
    // A choice made while storage is loading wins over the old saved value.
    if (!showPicked && s !== null) show = s === "1";
    if (pickedLanguage === undefined) {
      pickedLanguage = l === SOURCE_LANGUAGE ? null : validLanguage(l) ? l : undefined;
      language = pickedLanguage === undefined ? uiLanguage() : pickedLanguage;
    }
    emit();
  })
  .catch(() => {});

i18n.on?.("languageChanged", () => {
  if (pickedLanguage !== undefined) return;
  const next = uiLanguage();
  if (next === language) return;
  language = next;
  emit();
});

export const useShowCaptions = () => useSyncExternalStore(subscribe, () => show);
export const useCaptionLanguage = () => useSyncExternalStore(subscribe, () => language);
export function setShowCaptions(value: boolean) {
  showPicked = true;
  show = value;
  AsyncStorage.setItem(SHOW_KEY, value ? "1" : "0").catch(() => {});
  emit();
}
export function setCaptionLanguage(value: string | null) {
  if (value !== null && !validLanguage(value)) return;
  pickedLanguage = value;
  language = value;
  AsyncStorage.setItem(LANG_KEY, value ?? SOURCE_LANGUAGE).catch(() => {});
  emit();
}

// ── Folding (same rules as web) ──────────────────────────────────────────────
export function foldCaption(lines: StageCaptionLine[], next: StageCaptionLine): StageCaptionLine[] {
  const i = lines.findIndex((l) => l.id === next.id);
  if (i >= 0) {
    const copy = lines.slice();
    const prior = copy[i];
    copy[i] = prior.translations ? { ...next, translations: { ...prior.translations, ...next.translations } } : next;
    return copy;
  }
  return [...lines, next].slice(-MAX_LINES);
}

export function foldTranslation(
  lines: StageCaptionLine[],
  payload: { id: string; translations: Record<string, string> },
): StageCaptionLine[] {
  const i = lines.findIndex((l) => l.id === payload.id);
  if (i < 0) return lines;
  const copy = lines.slice();
  copy[i] = { ...copy[i], translations: { ...copy[i].translations, ...payload.translations } };
  return copy;
}

export function useStageCaptionFeed(
  spaceId: string | undefined,
  speakerWallets: string[],
  enabled: boolean,
): StageCaptionLine[] {
  const [lines, setLines] = useState<StageCaptionLine[]>([]);
  const lang = useCaptionLanguage();
  const allowedRef = useRef<Set<string>>(new Set());
  allowedRef.current = new Set(speakerWallets.map((w) => w.toLowerCase()));
  const langRef = useRef(lang);
  langRef.current = lang;
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!spaceId || !enabled) {
      setLines([]);
      return;
    }
    const channel = supabase
      .channel(`stage-captions:${spaceId}`, {
        config: { presence: { key: `viewer-${Math.random().toString(36).slice(2, 10)}` } },
      })
      .on("broadcast", { event: CAPTION_EVENT }, ({ payload }: any) => {
        if (!payload?.id || typeof payload.text !== "string") return;
        const wallet = String(payload.wallet || "").toLowerCase();
        if (!allowedRef.current.has(wallet)) return;
        setLines((prev) =>
          foldCaption(prev, {
            id: String(payload.id),
            wallet,
            name: payload.name || "",
            text: payload.text.slice(0, 500),
            final: !!payload.final,
            // Sender clocks disagree; stamping on arrival keeps expiry honest.
            at: Date.now(),
          }),
        );
      })
      .on("broadcast", { event: CAPTION_TRANSLATION_EVENT }, ({ payload }: any) => {
        if (!payload?.id || !payload.translations) return;
        setLines((prev) => foldTranslation(prev, payload));
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ lang: langRef.current ?? SOURCE_LANGUAGE }).catch(() => {});
        }
      });
    channelRef.current = channel;

    const sweeper = setInterval(() => {
      const now = Date.now();
      setLines((prev) => {
        const kept = prev.filter((l) => now - l.at < (l.final ? FINAL_TTL_MS : INTERIM_TTL_MS));
        return kept.length === prev.length ? prev : kept;
      });
    }, 1000);

    return () => {
      clearInterval(sweeper);
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setLines([]);
    };
  }, [spaceId, enabled]);

  // Re-publish the language without resubscribing (which would drop captions
  // for the second it takes to rejoin).
  useEffect(() => {
    channelRef.current?.track({ lang: lang ?? SOURCE_LANGUAGE }).catch?.(() => {});
  }, [lang]);

  return lines;
}
