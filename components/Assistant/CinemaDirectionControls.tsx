import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CINEMA_DIRECTION_FIELDS, normalizeCinemaDirection, type CinemaDirection, type CinemaField } from '../../libs/cinemaDirection';

interface Props {
  value: CinemaDirection;
  onChange: (value: CinemaDirection) => void;
  mode: string;
  disabled?: boolean;
}

export function CinemaDirectionControls({ value, onChange, mode, disabled }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState<CinemaField | null>(null);
  if (mode !== 'image' && mode !== 'video') return null;
  const direction = normalizeCinemaDirection(value);
  const text = (key: string, fallback: string) => t(`creator.cinema.${key}`, { defaultValue: fallback });
  const field = CINEMA_DIRECTION_FIELDS.find((entry) => entry.id === picker && (!entry.videoOnly || mode === 'video'));
  const close = () => setPicker(null);
  return (
    <View className="my-2 rounded-2xl border border-theme-neutrals-700 p-3">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={disabled} onPress={() => setExpanded(!expanded)}>
        <Text className="font-semibold text-theme-neutrals-100">{text('title', 'Cinema direction')}</Text>
      </Pressable>
      {expanded && <>
        <Text className="my-2 text-xs text-theme-neutrals-400">{text('hint', 'Guide the visual style of your next image or video. Results vary by model.')}</Text>
        <View className="flex-row flex-wrap gap-2">
          {CINEMA_DIRECTION_FIELDS.filter((entry) => !entry.videoOnly || mode === 'video').map((entry) => {
            const index = entry.options.indexOf(direction[entry.id] ?? '');
            const label = text(`${entry.id}.label`, entry.label);
            const selected = index >= 0 ? text(`${entry.id}.${index}`, entry.options[index]) : text('none', 'No direction');
            return <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`${label}: ${selected}`} disabled={disabled} onPress={() => setPicker(entry.id)} className="rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 px-3 py-2">
              <Text className="text-xs text-theme-neutrals-400">{label}</Text>
              <Text className="text-sm text-theme-neutrals-100">{selected}</Text>
            </Pressable>;
          })}
        </View>
        {Object.keys(direction).length > 0 && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { onChange({}); close(); }} className="mt-3"><Text className="text-xs text-theme-neutrals-300 underline">{text('reset', 'Clear direction')}</Text></Pressable>}
      </>}
      <Modal visible={Boolean(field)} transparent animationType="slide" onRequestClose={close}>
        <View className="flex-1 justify-end bg-black/60">
          <Pressable accessibilityRole="button" accessibilityLabel={text('close', 'Close')} className="flex-1" onPress={close} />
          <View className="max-h-[75%] rounded-t-2xl bg-theme-neutrals-900 p-4 pb-8">
            <Text accessibilityRole="header" className="mb-3 text-lg font-semibold text-theme-neutrals-100">{field && text(`${field.id}.label`, field.label)}</Text>
            <ScrollView>{field && ['', ...field.options].map((option, index) => (
              <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: (direction[field.id] ?? '') === option }} disabled={disabled} className="border-b border-theme-neutrals-700 py-3" onPress={() => { onChange(normalizeCinemaDirection({ ...direction, [field.id]: option })); close(); }}>
                <Text className="text-theme-neutrals-100">{index ? text(`${field.id}.${index - 1}`, option) : text('none', 'No direction')}{(direction[field.id] ?? '') === option ? ' ✓' : ''}</Text>
              </Pressable>
            ))}</ScrollView>
            <Pressable accessibilityRole="button" onPress={close} className="mt-3 py-2"><Text className="text-center text-theme-neutrals-300">{text('close', 'Close')}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
