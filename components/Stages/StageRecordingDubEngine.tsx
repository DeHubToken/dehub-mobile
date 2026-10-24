import { useEffect, useRef } from 'react';
import { useTranscript, useTranscriptTranslation } from '../../hooks/useTranscript';
import { useStageReplayDub } from '../../hooks/useStageReplayDub';
import { getStagePlaybackState, resumeStageRecording, useStagePlayback } from '../../libs/stage-playback';
import { setStageRecordingDubStatus, useStageRecordingLanguage } from '../../libs/stage-recording-language';

export default function StageRecordingDubEngine() {
  const playback = useStagePlayback();
  const { language } = useStageRecordingLanguage(playback.spaceId);
  const wanted = !!playback.spaceId && language !== 'original';
  const { transcript } = useTranscript('stage', playback.spaceId, wanted);
  const dubLanguage = wanted && language !== transcript?.source_lang ? language : null;
  const { translation } = useTranscriptTranslation(transcript?.id ?? null, language, !!dubLanguage && transcript?.status === 'ready');
  const waiting = useRef<string | null>(null);
  const dub = useStageReplayDub(playback.spaceId ?? undefined, transcript?.id ?? null, dubLanguage,
    translation?.status === 'ready' ? translation.segments : null, () => { waiting.current = playback.spaceId; });
  useEffect(() => {
    const id = playback.spaceId;
    if (!id) return;
    setStageRecordingDubStatus(id, language, language === 'original' ? 'original' : dub.ready ? 'ready' : dub.failed || translation?.status === 'failed' ? 'failed' : 'preparing');
    if (dub.ready && waiting.current === id) {
      waiting.current = null;
      if (getStagePlaybackState().spaceId === id) resumeStageRecording();
    }
  }, [playback.spaceId, language, dub.ready, dub.failed, translation?.status]);
  return null;
}
