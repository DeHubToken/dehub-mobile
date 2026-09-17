/**
 * Tip-to-speech on a live stream (mobile half)
 * ============================================
 * A gift can carry a line of text, and this reads it out loud to the viewer
 * while they watch — the same words, in the same voice, as the browser.
 *
 * The text is not synthesised here. React Native has no WebAssembly, so the
 * engine runs inside a zero-size WebView (components/Live/TipSpeaker) which
 * loads eSpeak NG and plays the audio itself. This module is the queue and the
 * sanitiser in front of it, and the registry the WebView attaches to.
 *
 * Two reasons it is a WebView rather than expo-speech:
 *
 * - **It ships over OTA.** expo-speech is a native module that is not in the
 *   current binary, so adding it would mean nobody hears a tip until they take
 *   a store update. react-native-webview is already in the build.
 * - **It is the same voice as web.** expo-speech reads through whatever TTS
 *   engine the handset happens to have, so the joke would land differently on
 *   every phone and not at all on some.
 *
 * Mirrors src/lib/live/tip-tts.ts in dehubweb. The sanitising rules have to
 * agree across the two, because both ends read the SAME broadcast — a message
 * one platform trims and the other does not is one the room hears differently.
 */

/** Matches dehubweb's MAX_TTS_CHARS. Roughly 15 seconds of speech. */
export const MAX_TTS_CHARS = 200;

/** Past this the oldest waiting line is dropped; the newest tip is the live one. */
const MAX_QUEUE = 5;

/**
 * Strip a tip message down to something worth speaking aloud.
 *
 * URLs go because eSpeak reads them letter by letter and a link is thirty
 * seconds of "aitch tee tee pee colon slash slash". Control characters and
 * runs of punctuation go because they are how you make the synthesiser stutter
 * for a minute on a two-word message.
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

type Sink = (text: string) => void;

let sink: Sink | null = null;
const pending: string[] = [];
let enabled = true;

/**
 * Attach the WebView that can actually speak. Anything queued while no sink was
 * mounted is flushed to it — a gift can land in the moment between the player
 * mounting and the WebView finishing its first load.
 */
export function registerTipSpeaker(next: Sink | null): void {
  sink = next;
  if (!sink) return;
  while (pending.length > 0) {
    const line = pending.shift();
    if (line) sink(line);
  }
}

/** Turn tip readings on or off. Honoured by the player's mute control. */
export function setTipTtsEnabled(on: boolean): void {
  enabled = on;
  if (!on) pending.length = 0;
}

export function isTipTtsEnabled(): boolean {
  return enabled;
}

/**
 * Read a tip message out over the stream.
 *
 * Safe to call for every gift: one with no message, or nothing left after
 * sanitising, is simply not queued.
 */
export function speakTipMessage(message: string | undefined | null): void {
  if (!enabled) return;
  const text = sanitiseTtsText(message);
  if (!text) return;
  if (sink) {
    sink(text);
    return;
  }
  pending.push(text);
  while (pending.length > MAX_QUEUE) pending.shift();
}
