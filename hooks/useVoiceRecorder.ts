import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAudioRecorder, RecordingPresets, type AudioRecorder } from 'expo-audio';
import { configureForRecording, releaseRecording } from '../libs/audioSession';
import { runWithPermissions } from '../libs/permissions.util';

const MAX_DURATION_MS = 29_000;
const WAVEFORM_BARS = 35;

export interface VoiceNoteResult { uri: string; durationMs: number; mimeType: string }
export interface UseVoiceRecorderOpts {
  onRecordingComplete: (result: VoiceNoteResult) => void;
  onCancel: () => void;
}
export interface VoiceRecorderHandle {
  isRecording: boolean;
  isStopping: boolean;
  elapsedMs: number;
  meterBars: number[];
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceRecorder(callbacks: UseVoiceRecorderOpts): VoiceRecorderHandle {
  const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recordingRef = useRef<AudioRecorder | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  const stopping = useRef(false);
  const cancelled = useRef(false);
  const startedAt = useRef(0);
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const [isRecording, setIsRecording] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [meterBars, setMeterBars] = useState<number[]>([]);

  const finish = useCallback(async (cancel: boolean) => {
    if (cancel) cancelled.current = true;
    // A synchronous latch covers two taps in the same render, including auto-stop.
    if (stopping.current) return;
    const rec = recordingRef.current;
    if (!rec) return;
    stopping.current = true;
    if (mounted.current) setIsStopping(true);
    let result: VoiceNoteResult | undefined;
    try {
      const status = rec.getStatus();
      if (status.isRecording) await rec.stop();
      const durationMs = status.durationMillis || Date.now() - startedAt.current;
      if (rec.uri && durationMs > 500) {
        result = { uri: rec.uri, durationMs, mimeType: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4' };
      }
    } catch (error) {
      console.error('[VoiceRecorder] stop error', error);
    } finally {
      recordingRef.current = null;
      await releaseRecording().catch(() => {});
      stopping.current = false;
      if (mounted.current) {
        setIsRecording(false);
        setIsStopping(false);
        setElapsedMs(0);
        setMeterBars([]);
      }
    }
    if (!mounted.current) return;
    if (result && !cancelled.current) latest.current.onRecordingComplete(result);
    else latest.current.onCancel();
  }, []);

  const stopRecording = useCallback(() => finish(false), [finish]);
  const cancelRecording = useCallback(() => finish(true), [finish]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_DURATION_MS) { void stopRecording(); return; }
      try {
        const level = recordingRef.current?.getStatus().metering;
        const normalized = level == null || level <= -160 ? 0.05 : Math.max(0.05, Math.min(1, (level + 40) / 40));
        setMeterBars(bars => [...bars.slice(-(WAVEFORM_BARS - 1)), normalized]);
      } catch {}
    }, 150);
    return () => clearInterval(timer);
  }, [isRecording, stopRecording]);

  const startRecording = useCallback(async () => {
    if (starting.current || stopping.current || recordingRef.current) return;
    starting.current = true;
    cancelled.current = false;
    let ownsSession = false;
    try {
      let allowed = false;
      await runWithPermissions(['microphone'], async () => { allowed = true; });
      if (!mounted.current || cancelled.current) return;
      if (!allowed) { latest.current.onCancel(); return; }
      ownsSession = true;
      await configureForRecording();
      await audioRecorder.prepareToRecordAsync();
      if (!mounted.current || cancelled.current) {
        await audioRecorder.stop().catch(() => {});
        return;
      }
      audioRecorder.record();
      recordingRef.current = audioRecorder;
      startedAt.current = Date.now();
      ownsSession = false; // finish/unmount now owns releasing this session.
      setIsRecording(true);
      setElapsedMs(0);
      setMeterBars([]);
    } catch (error) {
      console.error('[VoiceRecorder] start error', error);
      await audioRecorder.stop().catch(() => {});
      if (mounted.current) latest.current.onCancel();
    } finally {
      if (ownsSession) await releaseRecording().catch(() => {});
      starting.current = false;
    }
  }, [audioRecorder]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      const rec = recordingRef.current;
      if (rec && !stopping.current) {
        recordingRef.current = null;
        void rec.stop().catch(() => {}).finally(() => releaseRecording().catch(() => {}));
      }
    };
  }, []);

  return { isRecording, isStopping, elapsedMs, meterBars, startRecording, stopRecording, cancelRecording };
}
