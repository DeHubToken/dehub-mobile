import React, { useRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { CREATOR_AUDIO_TASKS, CREATOR_AUDIO_VOICES, CREATOR_SPEECH_MODELS, type CreatorAudioSettings, type CreatorAudioTask } from '../../libs/creatorAudio';
import { toastError } from '../../libs/toast';
import { useUser } from '../../context/AuthContext';

interface Props { value?: CreatorAudioSettings; onChange: (value: CreatorAudioSettings | undefined) => void; text: string; disabled: boolean; scopeKey?: string }
export function CreatorAudioControls({ value, onChange, text, disabled, scopeKey }: Props) {
  const { t } = useTranslation();
  const user = useUser();
  const owner = user?.walletAddress || user?.address;
  const active = useRef({ owner, scopeKey, value });
  active.current = { owner, scopeKey, value };
  const spec = value ? CREATOR_AUDIO_TASKS[value.task] : undefined;
  const chip = (label: string, onPress: () => void, selected = false) => <Pressable key={label} onPress={onPress} disabled={disabled}
    accessibilityRole="button" accessibilityState={{ selected, disabled }} className={`rounded-xl border px-3 py-2 ${selected ? 'border-theme-neutrals-100' : 'border-theme-neutrals-700'}`}>
    <Text className="text-xs text-theme-neutrals-100">{label}</Text></Pressable>;
  const pick = async () => {
    if (!value) return;
    const original = active.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: value.task === 'voice-changer' ? 'audio/*' : ['audio/*', 'video/*'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      if (active.current.owner !== original.owner || active.current.scopeKey !== original.scopeKey || active.current.value !== original.value) return;
      const file = result.assets[0];
      if (!file.size || file.size > 100 * 1024 * 1024) { toastError(t('creator.fileTooLarge')); return; }
      onChange({ ...value, media: { uri: file.uri, name: file.name, mimeType: file.mimeType || '', size: file.size } });
    } catch { toastError(t('creator.audioAttachFailed')); }
  };
  const speakers = [...new Set(text.split('\n').map(line => line.match(/^([^:]{1,32}):\s*.+$/)?.[1].trim().toLowerCase()).filter((name): name is string => !!name))];
  return <View className="mt-2 gap-2">
    <ScrollView horizontal contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
      {chip(t('creator.audioModels'), () => onChange(undefined), !value)}
      {(Object.entries(CREATOR_AUDIO_TASKS) as [CreatorAudioTask, typeof CREATOR_AUDIO_TASKS[CreatorAudioTask]][]).map(([task, item]) => chip(t(item.label), () => onChange({ ...value, task }), value?.task === task))}
    </ScrollView>
    {value && <>
      <Text className="text-xs text-theme-neutrals-400">{t('creator.priceFreeRateLimited')}</Text>
      {spec?.usesVoice && <ScrollView horizontal contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {CREATOR_AUDIO_VOICES.map(voice => chip(voice.name, () => onChange({ ...value, voiceId: voice.id }), (value.voiceId || CREATOR_AUDIO_VOICES[0].id) === voice.id))}
      </ScrollView>}
      {value.task === 'speech' && <View className="gap-1">
        <Text className="text-xs text-theme-neutrals-400">{t('creator.audioExportFormat')}</Text>
        <View className="flex-row gap-2">
          {chip(t('creator.audioExportMp3'), () => onChange({ ...value, outputFormat: 'mp3_44100_128' }), value.outputFormat !== 'wav_24000')}
          {chip(t('creator.audioExportWav'), () => onChange({ ...value, outputFormat: 'wav_24000' }), value.outputFormat === 'wav_24000')}
        </View>
      </View>}
      {value.task === 'speech' && <ScrollView horizontal contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {CREATOR_SPEECH_MODELS.map(modelId => chip(modelId.replace('eleven_', '').replace(/_/g, ' '), () => onChange({ ...value, modelId }), (value.modelId || CREATOR_SPEECH_MODELS[0]) === modelId))}
      </ScrollView>}
      {value.task === 'dialogue' && <>
        <Text className="text-xs text-theme-neutrals-400">{t('creator.dialogueFormat')}</Text>
        <ScrollView horizontal contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">{speakers.map((speaker, index) => {
          const primary = value.voiceId || CREATOR_AUDIO_VOICES[0].id;
          const voiceId = value.speakerVoices?.[speaker] || (index === 0 ? primary : CREATOR_AUDIO_VOICES.filter(voice => voice.id !== primary)[(index - 1) % 5].id);
          const voice = CREATOR_AUDIO_VOICES.find(item => item.id === voiceId) || CREATOR_AUDIO_VOICES[0];
          return chip(`${speaker}: ${voice.name}`, () => onChange({ ...value, speakerVoices: { ...value.speakerVoices,
            [speaker]: CREATOR_AUDIO_VOICES[(CREATOR_AUDIO_VOICES.findIndex(item => item.id === voice.id) + 1) % CREATOR_AUDIO_VOICES.length].id } }));
        })}</ScrollView>
      </>}
      {spec?.needsMedia && <View className="flex-row items-center gap-2">
        {chip(t('creator.audioAttach'), () => void pick(), !!value.media)}
        {value.media && <><Text className="max-w-[160px] text-xs text-theme-neutrals-400" numberOfLines={1}>{value.media.name}</Text>{chip(t('common.delete'), () => onChange({ ...value, media: undefined }))}</>}
      </View>}
      {value.task === 'sfx' && <View className="flex-row items-center gap-2">
        <Text className="text-xs text-theme-neutrals-400">{t('creator.audioSeconds')}</Text>
        <TextInput editable={!disabled} value={String(value.durationSeconds ?? 0)} keyboardType="decimal-pad" accessibilityLabel={t('creator.audioSeconds')}
          onChangeText={duration => onChange({ ...value, durationSeconds: Number(duration) })} className="w-16 rounded-xl bg-theme-neutrals-800 px-3 py-2 text-theme-neutrals-100" />
        {chip(t('creator.loop'), () => onChange({ ...value, loop: !value.loop }), !!value.loop)}
      </View>}
    </>}
  </View>;
}
