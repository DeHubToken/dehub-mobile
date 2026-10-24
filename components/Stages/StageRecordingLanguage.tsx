import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Dropdown from '../ui/Dropdown';
import { STAGE_RECORDING_LANGUAGES, setStageRecordingLanguage, useStageRecordingLanguage } from '../../libs/stage-recording-language';
import { getStagePlaybackState, playStageRecording, resumeStageRecording, type StagePlayable } from '../../libs/stage-playback';

export default function StageRecordingLanguage({ space }: { space: StagePlayable }) {
  const { t } = useTranslation();
  const selected = useStageRecordingLanguage(space.id);
  return <View style={{ flex: 1, minWidth: 0 }}>
    <Dropdown value={selected.language} searchable compact placeholder={t('settings.language')}
      options={[{ value: 'original', label: t('dub.original') }, ...STAGE_RECORDING_LANGUAGES.map(([value, label]) => ({ value, label }))]}
      onChange={(language) => {
        setStageRecordingLanguage(space.id, language);
        if (getStagePlaybackState().spaceId !== space.id) playStageRecording(space);
        else if (!getStagePlaybackState().loading) resumeStageRecording();
      }} />
    {selected.language !== 'original' && <Text className="text-xs text-theme-neutrals-400 mt-1" accessibilityRole="text">
      {t(selected.status === 'ready' ? 'dub.dubbed' : selected.status === 'failed' ? 'dub.noVoice' : 'dub.preparing')}
    </Text>}
  </View>;
}
