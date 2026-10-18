/**
 * Tip-to-speech on a live stream (mobile half)
 * ============================================
 * A gift can carry a line of text, and this reads it out loud to the viewer
 * while they watch.
 *
 * The voice is the phone's own, through expo-speech: the same engine and the
 * same voice picking (hooks/useVoiceDub `findVoice`) as dubbed videos. It costs
 * nothing per tip, needs no download, and sounds like a person. A phone with
 * no voice for the language stays silent; the celebration and the on-screen
 * text still play.
 *
 * Mirrors src/lib/live/tip-tts.ts in dehubweb. The sanitising and language
 * rules have to agree across the two, because both ends read the SAME
 * broadcast: a message one platform trims and the other does not is one the
 * room hears differently.
 */
import i18n from "i18next";
import type * as SpeechModule from "expo-speech";
import { findVoice, speechAvailable } from "../hooks/useVoiceDub";

/** Matches dehubweb's MAX_TTS_CHARS. Roughly 15 seconds of speech. */
export const MAX_TTS_CHARS = 200;

/** Past this the oldest waiting line is dropped; the newest tip is the live one. */
const MAX_QUEUE = 5;

/** Longest a line may hold the queue if the engine never reports the end. */
const LINE_TIMEOUT_MS = 20_000;

/**
 * Strip a tip message down to something worth speaking aloud.
 *
 * URLs go because a speech engine reads them letter by letter, and a link is
 * thirty seconds of "aitch tee tee pee colon slash slash". Control characters
 * and runs of punctuation go because they are how you make the synthesiser
 * stutter for a minute on a two-word message.
 */
export function sanitiseTtsText(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\p{C}/gu, " ")
    .replace(/[^\p{L}\p{N}\s.,!?'-]/gu, " ")
    .replace(/([.,!?'-])\1{2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

const SCRIPT_LANGS: [RegExp, string][] = [
  [/\p{Script=Hangul}/u, "ko"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "ja"],
  [/\p{Script=Han}/u, "zh"],
  [/\p{Script=Cyrillic}/u, "ru"],
  [/\p{Script=Arabic}/u, "ar"],
  [/\p{Script=Hebrew}/u, "he"],
  [/\p{Script=Greek}/u, "el"],
  [/\p{Script=Devanagari}/u, "hi"],
  [/\p{Script=Thai}/u, "th"],
];
const SCRIPT_OF_LANG: Record<string, string> = {
  ko: "ko", ja: "ja", zh: "zh", yue: "zh", ru: "ru", uk: "ru", bg: "ru", sr: "ru", kk: "ru", mn: "ru",
  ar: "ar", fa: "ar", ur: "ar", ps: "ar", he: "he", iw: "he", yi: "he", el: "el", hi: "hi", mr: "hi", ne: "hi", th: "th",
};

/**
 * Which language to read a message in.
 *
 * A tip is not translated, so it is read in the language it was written in.
 * The script decides that for anything non-Latin. Latin text is read in the
 * viewer's language when that is itself a Latin-script one (a Spanish viewer
 * most likely got a Spanish tip), and in English otherwise, rather than a
 * Russian voice spelling out English words.
 */
export function tipVoiceLang(text: string, viewerLang: string | null | undefined): string {
  const viewer = (viewerLang || "en").toLowerCase().replace("_", "-");
  const base = viewer.split("-")[0];
  for (const [re, lang] of SCRIPT_LANGS) {
    if (re.test(text)) return SCRIPT_OF_LANG[base] === lang ? viewer : lang;
  }
  return SCRIPT_OF_LANG[base] ? "en" : viewer;
}

let Speech: typeof SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Speech = speechAvailable ? require("expo-speech") : null;
} catch {
  Speech = null;
}

const queue: string[] = [];
let draining = false;
let enabled = true;
/** Settles the line being read when it is cut short. */
let cutCurrent: (() => void) | null = null;

/** Turn tip readings on or off. Honoured by the player's mute control. */
export function setTipTtsEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopTipTts();
}

export function isTipTtsEnabled(): boolean {
  return enabled;
}

/** Cut the current reading and drop anything waiting. */
export function stopTipTts(): void {
  queue.length = 0;
  if (cutCurrent) {
    void Speech?.stop();
    cutCurrent();
  }
}

function speakLine(text: string, language: string, voice: string | undefined): Promise<void> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (cutCurrent === done) cutCurrent = null;
      resolve();
    };
    cutCurrent = done;
    // An engine that never reports the end must not silence every tip behind it.
    timer = setTimeout(done, LINE_TIMEOUT_MS);
    Speech?.speak(text, {
      language,
      voice,
      useApplicationAudioSession: true,
      onDone: done,
      onStopped: done,
      onError: done,
    });
  });
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0 && enabled) {
      const text = queue.shift();
      if (!text || !Speech) break;
      try {
        const lang = tipVoiceLang(text, i18n.language);
        const voice = await findVoice(lang);
        // null: the phone has no voice for this language at all.
        if (voice === null || !enabled) continue;
        await speakLine(text, lang, voice?.identifier);
      } catch {
        // One unreadable message must not stall the ones behind it.
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Read a tip message out over the stream.
 *
 * Safe to call for every gift: one with no message, or nothing left after
 * sanitising, is simply not queued.
 */
export function speakTipMessage(message: string | undefined | null): void {
  if (!enabled || !Speech) return;
  const text = sanitiseTtsText(message);
  if (!text) return;
  queue.push(text);
  while (queue.length > MAX_QUEUE) queue.shift();
  void drain();
}
