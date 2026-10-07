/**
 * Dubbing with the phone's own voice.
 *
 * The server dub waited on a GPU worker that was never deployed, so every
 * request sat at 'pending' and nobody ever heard one. The device already ships
 * a speech engine for most of the languages we translate into, and the
 * translated transcript is already timed — speaking each line as the playhead
 * reaches it is a dub that costs nothing and works today. It is not the
 * creator's voice; it is a voice, in the viewer's language.
 *
 * Driven by the player's own clock (`timeUpdate`), the same as the captions,
 * so a pause, a seek, a loop and a rate change fall out of one rule instead of
 * a timer of our own that has to be told about each of them.
 */
import { useEffect, useRef } from "react";
import type * as SpeechModule from "expo-speech";
import type { VideoPlayer } from "expo-video";
import type { TranscriptSegment } from "./useTranscript";

/**
 * expo-speech is a native module and its entry throws on a binary built before
 * it was added — and this file sits on the home feed's import path, which ships
 * over the air to every installed version. Load it only when the installed app
 * has it; on older builds dubbing is simply unavailable until the next APK.
 */
let Speech: typeof SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Speech = require("expo-speech");
} catch {
  Speech = null;
}

/** The installed app can speak. False on builds that predate expo-speech. */
export const speechAvailable = Speech !== null;

/** Keep music and ambience quiet for the entire dub, including speech gaps. */
const ORIGINAL_VOLUME = 0.06;
/** Faster than this and a synthetic voice stops being intelligible. */
const MAX_RATE = 1.3;
/** Roughly what a device voice gets through per second at rate 1. */
const CHARS_PER_SECOND = 14;
/** A jump larger than this between ticks is a seek or a loop, not playback. */
const SEEK_JUMP_S = 1.5;
/** Landing this close to the end of a line, skip it and wait for the next. */
const MIN_REMAINING_S = 0.8;

/** "pt-BR", "pt_BR" and "pt" are the same language to a voice picker. */
export function baseLang(code: string | null | undefined): string {
  return (code ?? "").toLowerCase().split(/[-_]/)[0];
}

/** Index of the line playing at `t` seconds, or -1 before, after or between lines. */
export function segmentIndexAt(segments: TranscriptSegment[], t: number): number {
  return segments.findIndex((s) => t >= s.start && t < s.end);
}

/**
 * How fast to speak `text` so it fits the `seconds` left of its line. Never
 * slower than normal, never past MAX_RATE: a line that still does not fit
 * overruns a little and is cut by the next one, which beats drifting.
 */
export function speechRate(text: string, seconds: number, playbackRate = 1): number {
  const window = seconds / Math.max(0.25, playbackRate || 1);
  if (window <= 0) return MAX_RATE;
  const needed = text.length / CHARS_PER_SECOND / window;
  return Math.min(MAX_RATE, Math.max(1, needed));
}

let voicesPromise: Promise<SpeechModule.Voice[]> | null = null;
function loadVoices(): Promise<SpeechModule.Voice[]> {
  if (!voicesPromise) {
    const pending = Speech
      ? Speech.getAvailableVoicesAsync().catch(() => [] as SpeechModule.Voice[])
      : Promise.resolve([] as SpeechModule.Voice[]);
    voicesPromise = pending;
    // Android answers with an empty list until its engine has bound. Caching
    // that would report "no voice" for every language for the whole session.
    void pending.then((voices) => {
      if (!voices.length && voicesPromise === pending) voicesPromise = null;
    });
  }
  return voicesPromise;
}

/**
 * The best installed voice for a language: `null` when the device has none,
 * `undefined` when the engine would not list its voices — speak with just the
 * language then and let the platform choose.
 */
export async function findVoice(lang: string): Promise<SpeechModule.Voice | null | undefined> {
  if (!Speech) return null;
  const voices = await loadVoices();
  if (!voices.length) return undefined;
  const aliases: Record<string, string> = { no: 'nb', tl: 'fil', iw: 'he', yue: 'zh' };
  const base = aliases[baseLang(lang)] ?? baseLang(lang);
  const matches = voices.filter((v) => (aliases[baseLang(v.language)] ?? baseLang(v.language)) === base);
  if (!matches.length) return null;
  const exact = matches.filter((v) => v.language.toLowerCase().replace('_', '-') === lang.toLowerCase().replace('_', '-'));
  const pool = exact.length ? exact : matches;
  return pool.find((v) => v.quality === Speech?.VoiceQuality.Enhanced) ?? pool[0];
}

// The speech engine is one per device, but a feed mounts a player per card.
// Only the instance that started the current utterance may stop it, or a
// card scrolled past pausing itself would silence the one being watched.
let speaker: object | null = null;
const owners = new WeakMap<VideoPlayer, object>();
function stopIfMine(owner: object) {
  if (speaker !== owner) return;
  speaker = null;
  void Speech?.stop();
}

interface VoiceDubOptions {
  player: VideoPlayer | null;
  /** The translated lines, or null while the translation is not ready. */
  segments: TranscriptSegment[] | null;
  /** Language to speak in. */
  lang: string | null;
  enabled: boolean;
  onFailed?: () => void;
}

export function useVoiceDub({ player, segments, lang, enabled, onFailed }: VoiceDubOptions) {
  const active = speechAvailable && enabled && !!player && !!lang && !!segments?.length;
  const owner = useRef({}).current;
  const failedRef = useRef(onFailed);
  failedRef.current = onFailed;

  useEffect(() => {
    if (!active || !player || !segments || !lang) return;
    if (owners.has(player)) return;
    owners.set(player, owner);
    // The line most recently started. Reset to -1 whenever speech is cut, so
    // playback resumes with whatever line the playhead is on.
    let spoken = -1;
    let lastT = -1;
    let alive = true;
    let failed = false;
    let voiceReady = false;
    let voice: string | undefined;
    let utterance = 0;
    let userVolume = player.volume;
    let expectedVolume = userVolume;
    const syncVolume = () => {
      const target = alive && voiceReady && !failed ? userVolume * ORIGINAL_VOLUME : userVolume;
      expectedVolume = target;
      try { if (Math.abs(player.volume - target) >= 0.001) player.volume = target; } catch {}
    };

    const silence = () => {
      utterance++;
      stopIfMine(owner);
      spoken = -1;
    };
    const fail = () => {
      failed = true;
      silence();
      syncVolume();
      failedRef.current?.();
    };

    const speakAt = (t: number) => {
      if (!alive || failed || !voiceReady || !Speech || userVolume === 0) return;
      const i = segmentIndexAt(segments, t);
      if (i < 0 || i === spoken) return;
      const seg = segments[i];
      const remaining = seg.end - t;
      if (remaining < MIN_REMAINING_S) return;
      spoken = i;
      const text = (seg.text ?? "").trim();
      if (!text) return;
      // Never queue. An utterance still running from the last line is cut
      // here, or the dub falls behind the picture and never catches up.
      const id = ++utterance;
      speaker = owner;
      const current = () => alive && utterance === id;
      const finish = () => {
        if (!current()) return;
        if (speaker === owner) speaker = null;
      };
      void Speech.stop().then(() => {
        if (!current() || speaker !== owner || !player.playing || player.muted) return;
        Speech?.speak(text, {
          language: lang,
          voice,
          volume: userVolume,
          rate: speechRate(text, seg.end - player.currentTime, player.playbackRate),
          onStart: () => {
            if (!current()) return;
            if (!player.playing || player.muted || userVolume === 0) { silence(); return; }
          },
          onDone: finish,
          onStopped: finish,
          onError: () => { if (current()) fail(); },
        });
      }).catch(() => { if (current()) fail(); });
    };

    const onTime = ({ currentTime }: { currentTime: number }) => {
      const rate = Math.max(1, player.playbackRate || 1);
      const jumped =
        lastT >= 0 && (currentTime < lastT - 0.25 || currentTime - lastT > SEEK_JUMP_S * rate);
      lastT = currentTime;
      if (jumped) silence();
      if (!player.playing || player.muted || userVolume === 0) {
        if (speaker === owner) silence();
        return;
      }
      if (segmentIndexAt(segments, currentTime) < 0 && speaker === owner) silence();
      speakAt(currentTime);
    };

    const timeSub = player.addListener("timeUpdate", onTime);
    const playSub = player.addListener("playingChange", ({ isPlaying }: { isPlaying: boolean }) => {
      if (!isPlaying) silence();
      else if (!player.muted) speakAt(player.currentTime);
    });
    const muteSub = player.addListener("mutedChange", ({ muted }: { muted: boolean }) => {
      if (muted) silence();
    });
    const volumeSub = player.addListener("volumeChange", () => {
      if (Math.abs(player.volume - expectedVolume) >= 0.001) userVolume = player.volume;
      syncVolume();
      if (userVolume === 0 || player.muted) silence();
    });
    const endSub = player.addListener("playToEnd", silence);

    void findVoice(lang).then((found) => {
      if (!alive) return;
      if (found === null) { fail(); return; }
      voice = found?.identifier;
      voiceReady = true;
      syncVolume();
      if (player.playing && !player.muted) speakAt(player.currentTime);
    }).catch(() => { if (alive) fail(); });

    return () => {
      alive = false;
      timeSub.remove();
      playSub.remove();
      muteSub.remove();
      volumeSub.remove();
      endSub.remove();
      silence();
      syncVolume();
      if (owners.get(player) === owner) owners.delete(player);
    };
  }, [active, player, segments, lang, owner]);
}
