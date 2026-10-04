import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { CREATOR_VIDEO_RULES } from '../../config/creator-video-rules';
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
  disabled: boolean;
}

export default function CreatorStudioControls({ settings, onChange, onMode, onPresets, onAttach, disabled }: Props) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<'model' | 'aspect' | 'resolution' | 'texture' | null>(null);
  const [durationDraft, setDurationDraft] = useState(String(settings.durationSeconds));
  const editingDuration = useRef(false);
  useEffect(() => {
    if (!editingDuration.current) setDurationDraft(String(settings.durationSeconds));
  }, [settings.durationSeconds, settings.model, settings.mode]);
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
  const chip = (label: string, action: () => void, active = false) => (
    <Pressable key={label} onPress={action} disabled={disabled} accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }} accessibilityLabel={label}
      className={`rounded-xl border px-3 py-2 ${active ? 'border-theme-neutrals-100 bg-theme-neutrals-700' : 'border-theme-neutrals-700 bg-theme-neutrals-800'}`}>
      <Text className="text-xs font-semibold text-theme-neutrals-100">{label}</Text>
    </Pressable>
  );
  return (
    <View className="gap-2 px-4 pb-2">
      <View className="flex-row gap-2">
        {onAttach && (
          <Pressable onPress={onAttach} disabled={disabled} accessibilityRole="button"
            accessibilityState={{ disabled }} accessibilityLabel={t('dm.attachImage')}
            hitSlop={6} className="items-center justify-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 px-2.5">
            <Icon name="Paperclip" size={18} color={disabled ? '#3F3F46' : '#A1A1AA'} />
          </Pressable>
        )}
        {(Object.keys(CREATOR_MODE_KEYS) as CreatorMode[]).map((mode) => chip(t(CREATOR_MODE_KEYS[mode]), () => onMode(mode), mode === settings.mode))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {chip(selected?.name ?? settings.model, () => setPicker('model'))}
        {(settings.mode === 'image' || settings.mode === 'video') && chip(settings.aspect, () => setPicker('aspect'))}
        {settings.mode === 'video' && (
          <View className="flex-row items-center rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 px-2">
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
              className="w-10 py-2 text-center text-base font-semibold text-theme-neutrals-100"
            />
            <Text className="pr-1 text-xs text-theme-neutrals-400">{t('filters.duration')}</Text>
          </View>
        )}
        {settings.mode === 'video' && CREATOR_VIDEO_RULES[settings.model]?.supportsResolution && chip(settings.resolution, () => setPicker('resolution'))}
        {settings.mode === '3d' && chip(t(`creator.studioTexture.${settings.textureQuality}`), () => setPicker('texture'))}
        {(settings.mode === 'image' || settings.mode === 'video') && chip(t('creator.presets'), onPresets)}
      </ScrollView>
      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View className="flex-1 justify-end bg-black/70">
          <Pressable className="flex-1" onPress={() => setPicker(null)} accessibilityLabel={t('common.close')} />
          <View className="max-h-[70%] rounded-t-3xl bg-theme-neutrals-900 px-4 pb-8 pt-4">
            <Pressable onPress={() => setPicker(null)} className="mb-3 self-end p-2" accessibilityRole="button">
              <Text className="text-theme-neutrals-100">{t('common.close')}</Text>
            </Pressable>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((option) => (
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
