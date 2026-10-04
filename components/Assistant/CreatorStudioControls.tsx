import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CREATOR_VIDEO_RULES } from '../../config/creator-video-rules';
import { MODEL3D_MODELS } from '../../config/model3d-models.constants';
import {
  CREATOR_MODE_KEYS, creatorAspects, creatorDurations, creatorModels,
  normalizeCreatorSettings, type CreatorMode, type CreatorStudioSettings,
} from '../../libs/creatorStudio';

interface Props {
  settings: CreatorStudioSettings;
  onChange: (settings: CreatorStudioSettings) => void;
  onMode: (mode: CreatorMode) => void;
  onPresets: () => void;
  disabled: boolean;
}

export default function CreatorStudioControls({ settings, onChange, onMode, onPresets, disabled }: Props) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<'model' | 'aspect' | 'duration' | 'resolution' | 'texture' | null>(null);
  const models = creatorModels(settings.mode);
  const selected = models.find((model) => model.id === settings.model);
  const options: { id: string; name: string; description?: string }[] = picker === 'model' ? models
    : picker === 'aspect' ? creatorAspects(settings).map((id) => ({ id, name: id }))
    : picker === 'duration' ? creatorDurations(settings.model).map((value) => ({ id: String(value), name: `${value}s` }))
    : picker === 'resolution' ? (CREATOR_VIDEO_RULES[settings.model]?.resolutions ?? ['720p']).map((id) => ({ id, name: id }))
    : ['none', 'standard', ...(MODEL3D_MODELS[settings.model]?.hdMultiplier ? ['HD'] : [])].map((id) => ({ id, name: t(`creator.studioTexture.${id}`) }));
  const choose = (id: string) => {
    const next = { ...settings };
    if (picker === 'model') next.model = id;
    if (picker === 'aspect') next.aspect = id;
    if (picker === 'duration') next.durationSeconds = Number(id);
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
        {(Object.keys(CREATOR_MODE_KEYS) as CreatorMode[]).map((mode) => chip(t(CREATOR_MODE_KEYS[mode]), () => onMode(mode), mode === settings.mode))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {chip(selected?.name ?? settings.model, () => setPicker('model'))}
        {(settings.mode === 'image' || settings.mode === 'video') && chip(settings.aspect, () => setPicker('aspect'))}
        {settings.mode === 'video' && chip(`${settings.durationSeconds}s`, () => setPicker('duration'))}
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
