/**
 * Voice chat with the Assistant, as on web (use-voice-assistant.ts).
 *
 * Tap the ball: the session is paid for once up front (20 exchanges), then the
 * loop runs on its own. Listen until the speaker goes quiet, transcribe with
 * Whisper, hand the words to the chat, read the answer back with Dia, listen
 * again. `level` carries the loudness of whichever side is talking, for the ball.
 *
 * Everything here uses native modules the installed app already has
 * (expo-audio's recorder, player and sampling).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer, RecordingPresets, useAudioRecorder, type AudioPlayer } from 'expo-audio';
import { useSharedValue } from 'react-native-reanimated';
import { useTranslation as _useCopy } from 'react-i18next';
import { configureForDuckedPlayback, configureForRecording, releaseRecording } from '../libs/audioSession';
import { runWithPermissions } from '../libs/permissions.util';
import { uploadLocalFileToBucket } from '../libs/storage-upload';
import { startAiTool } from '../services/ai.service';
import { toastError, toastSuccess } from '../libs/toast';
import { createLogger } from '../libs/logger';

const log = createLogger('VoiceChat');

/** DHB per exchange (Whisper 60 + Dia 80) and exchanges per session, as on web. */
export const VOICE_EXCHANGE_DHB = 140;
export const VOICE_SESSION_EXCHANGES = 20;

export type VoiceStatus = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

// Metering is in dBFS. Speech has started once it passes SPEECH_DB, and the
// turn ends after SILENCE_MS under QUIET_DB.
const SPEECH_DB = -35;
const QUIET_DB = -42;
const SILENCE_MS = 1600;
const MIN_TURN_MS = 1000;
const MAX_TURN_MS = 30_000;

interface Options {
  walletAddress: string | null;
  payForSession: (priceDhb: number) => Promise<string>;
  onTranscript: (text: string) => void;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*|\*|`/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, '. ')
    .trim()
    .slice(0, 1500);
}

function isPaymentRequired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /402|payment|exhausted|used up|insufficient/i.test(message);
}

export function useVoiceChat({ walletAddress, payForSession, onTranscript }: Options) {
  const { t: _copy } = _useCopy();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const level = useSharedValue(0);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [status, setStatusState] = useState<VoiceStatus>('idle');
  const [exchangesLeft, setExchangesLeft] = useState<number | undefined>();

  const voiceMode = useRef(false);
  const sessionTx = useRef<string | null>(null);
  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const finishSpeaking = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ walletAddress, payForSession, onTranscript });
  latest.current = { walletAddress, payForSession, onTranscript };

  const setStatus = useCallback((next: VoiceStatus) => {
    if (next !== 'listening' && next !== 'speaking') level.value = 0;
    if (mounted.current) setStatusState(next);
  }, [level]);

  const clearMeter = useCallback(() => {
    if (meterTimer.current) clearInterval(meterTimer.current);
    meterTimer.current = null;
  }, []);

  const releasePlayer = useCallback(() => {
    const current = player.current;
    player.current = null;
    if (current) {
      try { current.pause(); current.remove(); } catch {}
    }
    const done = finishSpeaking.current;
    finishSpeaking.current = null;
    done?.();
  }, []);

  const stopRecorder = useCallback(async (): Promise<string | null> => {
    clearMeter();
    let uri: string | null = null;
    try {
      if (recorder.getStatus().isRecording) await recorder.stop();
      uri = recorder.uri;
    } catch (error) {
      log.warn('stop failed:', error);
    }
    await releaseRecording().catch(() => {});
    return uri;
  }, [recorder, clearMeter]);

  // Declared before use through a ref, since listening and processing call each other.
  const listenRef = useRef<() => Promise<void>>(async () => {});

  const processTurn = useCallback(async () => {
    const uri = await stopRecorder();
    if (!voiceMode.current) return;
    if (!uri) { void listenRef.current(); return; }
    setStatus('transcribing');
    try {
      const ext = Platform.OS === 'ios' ? 'm4a' : 'mp4';
      const audioUrl = await uploadLocalFileToBucket({
        bucket: 'chat-media',
        path: `voice-assistant/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
        uri,
        contentType: 'audio/mp4',
      });
      const result = await startAiTool({ tool: 'whisper', audio_url: audioUrl, txHash: sessionTx.current ?? undefined, purpose: 'voice' }, latest.current.walletAddress);
      if (result.error) throw new Error(result.error);
      setExchangesLeft(left => (left === undefined ? left : Math.max(0, left - 1)));
      const text = (result.text ?? '').trim();
      if (!voiceMode.current) return;
      if (!text) { void listenRef.current(); return; }
      setStatus('thinking');
      latest.current.onTranscript(text);
    } catch (error) {
      log.error('transcription failed:', error);
      if (isPaymentRequired(error)) {
        toastError(_copy('copy.cf69d7e172fd', { defaultValue: 'Voice session used up — start voice mode again to buy another.' }));
        sessionTx.current = null;
        voiceMode.current = false;
        if (mounted.current) { setIsVoiceMode(false); setExchangesLeft(undefined); }
        setStatus('idle');
        return;
      }
      toastError(_copy('copy.ccb684944295', { defaultValue: 'Transcription failed' }));
      if (voiceMode.current) void listenRef.current();
    }
  }, [stopRecorder, setStatus, _copy]);

  const startListening = useCallback(async () => {
    if (!voiceMode.current) return;
    try {
      await configureForRecording();
      await recorder.prepareToRecordAsync();
      if (!voiceMode.current) { await recorder.stop().catch(() => {}); return; }
      recorder.record();
    } catch (error) {
      log.error('could not start the mic:', error);
      toastError(_copy('copy.3dd8c4dd8ee7', { defaultValue: 'Microphone access required for voice mode' }));
      voiceMode.current = false;
      if (mounted.current) setIsVoiceMode(false);
      setStatus('idle');
      return;
    }
    setStatus('listening');
    const startedAt = Date.now();
    let heard = false;
    let quietSince = 0;
    clearMeter();
    meterTimer.current = setInterval(() => {
      let db = -160;
      try { db = recorder.getStatus().metering ?? -160; } catch {}
      level.value = Math.max(0, Math.min(1, (db + 50) / 40));
      const now = Date.now();
      if (db > SPEECH_DB) { heard = true; quietSince = 0; }
      else if (db < QUIET_DB && heard) quietSince = quietSince || now;
      const elapsed = now - startedAt;
      const silentLongEnough = heard && quietSince && now - quietSince > SILENCE_MS && elapsed > MIN_TURN_MS;
      if (silentLongEnough || elapsed > MAX_TURN_MS) {
        clearMeter();
        if (heard) void processTurn();
        else { void stopRecorder().then(() => { if (voiceMode.current) void listenRef.current(); }); }
      }
    }, 100);
  }, [recorder, level, clearMeter, processTurn, stopRecorder, setStatus, _copy]);
  listenRef.current = startListening;

  /** Read an answer out, then listen again. */
  const speak = useCallback(async (text: string) => {
    if (!voiceMode.current) return;
    const clean = cleanForSpeech(text);
    if (!clean) { void startListening(); return; }
    setStatus('speaking');
    try {
      const result = await startAiTool({ tool: 'dia-tts', text: clean, txHash: sessionTx.current ?? undefined, purpose: 'voice' }, latest.current.walletAddress);
      if (result.error || !result.audioUrl) throw new Error(result.error || 'No audio');
      if (!voiceMode.current) return;
      await configureForDuckedPlayback().catch(() => {});
      await new Promise<void>((resolve) => {
        const next = createAudioPlayer(result.audioUrl!);
        player.current = next;
        finishSpeaking.current = resolve;
        let sampled = false;
        try {
          if (next.isAudioSamplingSupported) {
            next.setAudioSamplingEnabled(true);
            next.addListener('audioSampleUpdate', (sample) => {
              const frames = sample.channels?.[0]?.frames;
              if (!frames?.length) return;
              let sum = 0;
              for (let i = 0; i < frames.length; i++) sum += frames[i] * frames[i];
              sampled = true;
              level.value = Math.min(1, Math.sqrt(sum / frames.length) * 4);
            });
          }
        } catch {}
        // Without samples the ball still talks, to a speech-like rhythm.
        const startedAt = Date.now();
        meterTimer.current = setInterval(() => {
          if (sampled) return;
          const s = (Date.now() - startedAt) / 1000;
          level.value = 0.35 + 0.45 * Math.abs(Math.sin(s * 8.7) * Math.sin(s * 2.3 + 1));
        }, 60);
        next.addListener('playbackStatusUpdate', (s) => {
          if (s.didJustFinish) { clearMeter(); releasePlayer(); }
        });
        next.play();
      });
    } catch (error) {
      log.warn('speech failed:', error);
    }
    clearMeter();
    if (voiceMode.current) void startListening();
  }, [setStatus, startListening, level, clearMeter, releasePlayer]);

  /** The chat answered with nothing to read out (an error, a paywall): listen again. */
  const resume = useCallback(() => {
    if (voiceMode.current) void startListening();
  }, [startListening]);

  const skip = useCallback(() => {
    clearMeter();
    releasePlayer();
  }, [clearMeter, releasePlayer]);

  const start = useCallback(async () => {
    if (voiceMode.current) return;
    let allowed = false;
    await runWithPermissions(['microphone'], async () => { allowed = true; });
    if (!allowed) {
      toastError(_copy('copy.3dd8c4dd8ee7', { defaultValue: 'Microphone access required for voice mode' }));
      return;
    }
    // A session already paid for is picked back up: stopping and restarting
    // voice must not cost twice.
    if (!sessionTx.current) {
      try {
        sessionTx.current = await latest.current.payForSession(VOICE_EXCHANGE_DHB * VOICE_SESSION_EXCHANGES);
        if (mounted.current) setExchangesLeft(VOICE_SESSION_EXCHANGES);
        toastSuccess(_copy('copy.1a19c3a9fe4b', { defaultValue: 'Voice mode activated — {{value1}} exchanges paid for.', value1: VOICE_SESSION_EXCHANGES }));
      } catch (error) {
        toastError(error instanceof Error ? error.message : _copy('copy.0cf23e6e3094', { defaultValue: 'Could not pay for a voice session.' }));
        return;
      }
    }
    voiceMode.current = true;
    if (mounted.current) setIsVoiceMode(true);
    void startListening();
  }, [startListening, _copy]);

  const stop = useCallback(() => {
    voiceMode.current = false;
    clearMeter();
    releasePlayer();
    void stopRecorder();
    if (mounted.current) setIsVoiceMode(false);
    setStatus('idle');
  }, [clearMeter, releasePlayer, stopRecorder, setStatus]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      voiceMode.current = false;
      clearMeter();
      releasePlayer();
      try { if (recorder.getStatus().isRecording) void recorder.stop(); } catch {}
      void releaseRecording().catch(() => {});
    };
  }, [recorder, clearMeter, releasePlayer]);

  return { isVoiceMode, status, exchangesLeft, level, start, stop, skip, speak, resume };
}
