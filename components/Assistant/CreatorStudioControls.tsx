import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon, { type IconName } from '../ui/Icon';
import { CREATOR_VIDEO_RULES } from '../../config/creator-video-rules';
import { VIDEO_MODELS } from '../../config/ai-models.constants';
import { MODEL3D_MODELS } from '../../config/model3d-models.constants';
import {
  CREATOR_MODE_KEYS, creatorAspects, creatorModels,
  normalizeCreatorSettings, type CreatorMode, type CreatorStudioSettings,
} from '../../libs/creatorStudio';

interface Props {
  settings: CreatorStudioSettings;
  onChange: (settings: CreatorStudioSettings) => void;
  onMode: (mode: CreatorMode) => void;
  onPresets: () => void;
  onAttach?: () => void;
  onWorkflow?: (workflow: 'swap' | 'motion') => void;
  disabled: boolean;
}

const MODE_ICONS: Record<CreatorMode, IconName> = { image: 'Image', video: 'Video', audio: 'Music', '3d': 'Package' };

export default function CreatorStudioControls({ settings, onChange, onMode, onPresets, onAttach, onWorkflow, disabled }: Props) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<'model' | 'aspect' | 'resolution' | 'texture' | null>(null);
  const [modelSearch, setModelSearch] = useSurfaceDraft("components/Assistant/CreatorStudioControls.tsx:modelSearch", '');
  useEffect(() => { setModelSearch.initialize(''); }, [picker, settings.mode, setModelSearch]);
  const [durationDraft, setDurationDraft] = useSurfaceDraft("components/Assistant/CreatorStudioControls.tsx:durationDraft", String(settings.durationSeconds), `${settings.mode}:${settings.model}`);
  const editingDuration = useRef(false);
  useEffect(() => {
    if (!editingDuration.current) setDurationDraft.initialize(String(settings.durationSeconds));
  }, [settings.durationSeconds, settings.model, settings.mode, setDurationDraft]);
  const commitDuration = () => {
    editingDuration.current = false;
    const durationSeconds = durationDraft.trim() && Number.isFinite(Number(durationDraft))
      ? Number(durationDraft) : settings.durationSeconds;
    const next = normalizeCreatorSettings({ ...settings, durationSeconds });
    setDurationDraft(String(next.durationSeconds));
    onChange(next);
  };
  const models = creatorModels(settings.mode);
  const selected = models.find((model) => model.id === settings.model);
  const options: { id: string; name: string; description?: string }[] = picker === 'model' ? models
    : picker === 'aspect' ? creatorAspects(settings).map((id) => ({ id, name: id }))
    : picker === 'resolution' ? (CREATOR_VIDEO_RULES[settings.model]?.resolutions ?? ['720p']).map((id) => ({ id, name: id }))
    : ['none', 'standard', ...(MODEL3D_MODELS[settings.model]?.hdMultiplier ? ['HD'] : [])].map((id) => ({ id, name: t(`creator.studioTexture.${id}`) }));
  const choose = (id: string) => {
    const next = { ...settings };
    if (picker === 'model') next.model = id;
    if (picker === 'aspect') next.aspect = id;
    if (picker === 'resolution') next.resolution = id;
    if (picker === 'texture') next.textureQuality = id as CreatorStudioSettings['textureQuality'];
    onChange(normalizeCreatorSettings(next));
    setPicker(null);
  };
  const query = modelSearch.trim().toLocaleLowerCase();
  const visibleOptions = picker === 'model' && query
    ? options.filter(option => `${option.name} ${option.description ?? ''} ${option.id}`.toLocaleLowerCase().includes(query))
    : options;
  const chip = (label: string, action: () => void, active = false, fullLabel = label) => (
    <Pressable key={label} onPress={action} disabled={disabled} accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }} accessibilityLabel={fullLabel}
      className={`rounded-xl border px-2 py-2 ${active ? 'border-theme-neutrals-100 bg-theme-neutrals-700' : 'border-theme-neutrals-700 bg-theme-neutrals-800'}`}>
      <Text className="text-xs font-semibold text-theme-neutrals-100">{label}</Text>
    </Pressable>
  );
  return (
    <View className="gap-2 px-4 pb-2">
      <View className="flex-row flex-wrap items-center gap-1">
        {onAttach && (
          <Pressable onPress={onAttach} disabled={disabled} accessibilityRole="button"
            accessibilityState={{ disabled }} accessibilityLabel={t('dm.attachImage')}
            className="h-9 w-7 items-center justify-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800">
            <Icon name="Paperclip" size={16} color={disabled ? '#3F3F46' : '#A1A1AA'} />
          </Pressable>
        )}
        <View className="flex-row rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 p-0.5">
          {(Object.keys(CREATOR_MODE_KEYS) as CreatorMode[]).map((mode) => (
            <Pressable key={mode} onPress={() => onMode(mode)} disabled={disabled} accessibilityRole="button"
              accessibilityState={{ disabled, selected: mode === settings.mode }} accessibilityLabel={t(CREATOR_MODE_KEYS[mode])}
              className={`h-8 w-7 items-center justify-center rounded-lg ${mode === settings.mode ? 'bg-theme-neutrals-700' : ''}`}>
              <Icon name={MODE_ICONS[mode]} size={15} color={mode === settings.mode ? '#FAFAFA' : '#A1A1AA'} />
            </Pressable>
          ))}
        </View>
        {chip((selected?.name ?? settings.model).split(/\s+/)[0], () => setPicker('model'), false, selected?.name ?? settings.model)}
        {(settings.mode === 'image' || (settings.mode === 'video' && !VIDEO_MODELS[settings.model]?.requiresVideoInput)) && chip(settings.aspect, () => setPicker('aspect'))}
        {settings.mode === 'video' && !VIDEO_MODELS[settings.model]?.requiresVideoInput && (
          <View className="flex-row items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 px-1.5">
            <TextInput
              value={durationDraft}
              onFocus={() => { editingDuration.current = true; }}
              onChangeText={(value) => {
                const draft = value.replace(/\D/g, '');
                setDurationDraft(draft);
                if (draft && Number.isFinite(Number(draft))) {
                  onChange(normalizeCreatorSettings({ ...settings, durationSeconds: Number(draft) }));
                }
              }}
              onBlur={commitDuration}
              onSubmitEditing={commitDuration}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              editable={!disabled}
              accessibilityLabel={t('filters.duration')}
              className="w-5 py-1.5 text-center text-base font-semibold text-theme-neutrals-100"
            />
            <Text className="text-xs text-theme-neutrals-400">s</Text>
          </View>
        )}
        {settings.mode === 'video' && VIDEO_MODELS[settings.model]?.requiresVideoInput && <Text className="self-center text-xs text-theme-neutrals-400">{t('creator.referenceClipSeconds', { seconds: settings.durationSeconds })}</Text>}
        {settings.mode === 'video' && CREATOR_VIDEO_RULES[settings.model]?.supportsResolution && chip(settings.resolution, () => setPicker('resolution'))}
        {settings.mode === '3d' && chip(t(`creator.studioTexture.${settings.textureQuality}`), () => setPicker('texture'))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {(settings.mode === 'image' || settings.mode === 'video') && chip(t('creator.presets'), onPresets)}
        {settings.mode === 'video' && onWorkflow && <>
          {chip(t('creator.characterSwap'), () => onWorkflow('swap'), settings.model === 'kling-o3-edit')}
          {chip(t('creator.copyMotion'), () => onWorkflow('motion'), settings.model === 'kling-3-motion')}
        </>}
      </View>
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View className="flex-1 justify-end bg-black/70">
          <Pressable className="flex-1" onPress={() => setPicker(null)} accessibilityLabel={t('common.close')} />
          <View className="max-h-[70%] rounded-t-3xl bg-theme-neutrals-900 px-4 pb-8 pt-4">
            <Pressable onPress={() => setPicker(null)} className="mb-3 self-end p-2" accessibilityRole="button">
              <Text className="text-theme-neutrals-100">{t('common.close')}</Text>
            </Pressable>
            {picker === 'model' && <TextInput
              value={modelSearch} onChangeText={setModelSearch}
              placeholder={t('common.search')} accessibilityLabel={t('common.search')}
              placeholderTextColor="#71717A" autoCorrect={false}
              className="mb-3 rounded-xl bg-theme-neutrals-800 px-4 py-3 text-theme-neutrals-100"
            />}
            <ScrollView keyboardShouldPersistTaps="handled">
              {!visibleOptions.length && <Text className="p-4 text-theme-neutrals-400">{t('common.noResults')}</Text>}
              {visibleOptions.map((option) => (
                <Pressable key={option.id} onPress={() => choose(option.id)} className="mb-2 rounded-2xl bg-theme-neutrals-800 p-4" accessibilityRole="button">
                  <Text className="font-bold text-theme-neutrals-100">{option.name}</Text>
                  {!!option.description && <Text className="mt-1 text-xs text-theme-neutrals-400">{option.description}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
