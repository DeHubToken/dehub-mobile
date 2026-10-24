import { useEffect, useRef, useState } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCachedVideoDub } from './useCachedVideoDub';
import { findVoice, getSpeechEngine, segmentIndexAt, speechRate } from './useVoiceDub';
import type { TranscriptSegment } from './useTranscript';
import { getStageRecordingPlayer, getStagePlaybackState, pauseStageRecording, useStagePlayback } from '../libs/stage-playback';

/** Dubbed replay uses the recording's transport, including seeks and lock-screen pauses. */
export function useStageReplayDub(stageId: string | undefined, transcriptId: string | null, language: string | null, segments: TranscriptSegment[] | null, onWait?: () => void) {
  const waitHandler = useRef(onWait);
  waitHandler.current = onWait;
  const playback = useStagePlayback();
  const cached = useCachedVideoDub(transcriptId, language, !!language && !!segments?.length);
  const [voice, setVoice] = useState<string | null | undefined>(null);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const dub = useRef<AudioPlayer | null>(null);
  const spoken = useRef(-1);
  const lastTime = useRef(-1);
  const utterance = useRef(0);
  const speaking = useRef(false);
  const Speech = getSpeechEngine();
  const url = language && !audioFailed ? cached?.audioUrl ?? null : null;
  const stopSpeech = () => {
    utterance.current++;
    spoken.current = -1;
    if (speaking.current) { speaking.current = false; void Speech?.stop(); }
  };
  useEffect(() => {
    let alive = true;
    setVoice(null); setDeviceFailed(false); setAudioFailed(false);
    stopSpeech();
    if (language) void findVoice(language).then((found) => {
      if (alive) setVoice(found === null ? null : found?.identifier);
    });
    return () => { alive = false; stopSpeech(); };
  }, [language, transcriptId]);
  useEffect(() => {
    if (!url) return;
    const audio = createAudioPlayer({ uri: url }, { updateInterval: 200 });
    dub.current = audio;
    const timeout = setTimeout(() => { if (!audio.isLoaded) setAudioFailed(true); }, 30000);
    return () => {
      clearTimeout(timeout); audio.pause(); audio.remove();
      if (dub.current === audio) dub.current = null;
    };
  }, [url]);
  const ready = !language || (!!segments?.length && (!!url || (voice !== null && !deviceFailed && !!Speech)));
  useEffect(() => {
    const original = getStageRecordingPlayer();
    const active = !!stageId && playback.spaceId === stageId && !!language;
    if (!original || !active) { dub.current?.pause(); stopSpeech(); return; }
    const audio = dub.current;
    const current = getStagePlaybackState();
    const playing = !current.paused && !current.loading;
    if (!ready && playing) { waitHandler.current?.(); pauseStageRecording(); }
    original.volume = ready ? 0 : 1;
    const t = original.currentTime || current.position;
    if (url && audio) {
      stopSpeech();
      let alive = true;
      const sync = async () => {
        try {
          if (!audio.isLoaded) return;
          const state = getStagePlaybackState();
          const shouldPlay = state.spaceId === stageId && !state.paused && !state.loading;
          audio.setPlaybackRate(state.rate);
          if (!shouldPlay) audio.pause();
          const position = original.currentTime || state.position;
          if (Math.abs(audio.currentTime - position) > 0.3) {
            audio.pause(); await audio.seekTo(position);
          }
          if (alive && shouldPlay) audio.play();
        } catch { if (alive) setAudioFailed(true); }
      };
      void sync();
      const sub = audio.addListener('playbackStatusUpdate', () => { void sync(); });
      return () => { alive = false; sub.remove(); };
    }
    if (!playing || !ready || !Speech || !segments || !language) { stopSpeech(); return; }
    if (lastTime.current >= 0 && (t < lastTime.current - 0.25 || t - lastTime.current > 2 * current.rate)) stopSpeech();
    lastTime.current = t;
    const index = segmentIndexAt(segments, t);
    if (index < 0) { stopSpeech(); return; }
    if (index === spoken.current) return;
    stopSpeech();
    spoken.current = index;
    const id = ++utterance.current;
    const segment = segments[index];
    speaking.current = true;
    void Speech.stop().then(() => {
      if (utterance.current !== id) return;
      Speech.speak(segment.text, {
        language, voice: voice ?? undefined, useApplicationAudioSession: true,
        rate: speechRate(segment.text, segment.end - t, current.rate),
        onDone: () => { if (utterance.current === id) speaking.current = false; },
        onError: () => { if (utterance.current === id) setDeviceFailed(true); },
      });
    });
  }, [playback.position, playback.paused, playback.loading, playback.spaceId, playback.rate, stageId, language, segments, ready, url, voice]);
  useEffect(() => () => {
    const original = getStageRecordingPlayer();
    if (original && getStagePlaybackState().spaceId === stageId) original.volume = 1;
    stopSpeech();
  }, [stageId, language]);
  return { ready, failed: !ready && (deviceFailed || voice === null) && (audioFailed || ['failed', 'unavailable', 'too-long'].includes(cached?.status ?? '')) };
}
