import { translateCopy as _translateCopy } from '../../i18n/copy';
import React, { memo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * The row under the welcome message.
 *
 * Web's seven actions in web's order, plus Presets (web's creator strip). Three of them are not
 * prompts — Poster, Song and Build open a flow directly — so each chip carries
 * an `action` and the screen decides, rather than every chip stuffing text into
 * the composer as they all used to here.
 */
export type QuickAction =
  | { kind: 'prompt'; text: string }
  | { kind: 'poster' }
  | { kind: 'song' }
  | { kind: 'edit-image' }
  | { kind: 'builder' }
  | { kind: 'templates' };

interface Chip {
  label: string;
  /** Translated label, shown after `label` (then just the emoji). */
  labelKey?: string;
  action: QuickAction;
}

const CHIPS: Chip[] = [
  { get label() { return _translateCopy("copy.f4b92103156d", { defaultValue: "📰 What's new?" }); }, action: { kind: 'prompt', get text() { return _translateCopy("copy.fcb915eabe62", { defaultValue: "What's new on DeHub?" }); } } },
  { label: '✨', labelKey: 'creator.presets', action: { kind: 'templates' } },
  { get label() { return _translateCopy("copy.9d5c64ebd6a0", { defaultValue: "🎨 Make DeHub Poster" }); }, action: { kind: 'poster' } },
  { get label() { return _translateCopy("copy.768e8893617f", { defaultValue: "🖼️ Generate image" }); }, action: { kind: 'prompt', text: 'Generate an image of ' } },
  { get label() { return _translateCopy("copy.816013054aa7", { defaultValue: "✏️ Edit image" }); }, action: { kind: 'edit-image' } },
  { get label() { return _translateCopy("copy.f1bed1726a8b", { defaultValue: "🎥 Generate video" }); }, action: { kind: 'prompt', text: 'Generate a video of ' } },
  { get label() { return _translateCopy("copy.68845e302faf", { defaultValue: "🎵 Create a song" }); }, action: { kind: 'song' } },
  { get label() { return _translateCopy("copy.c72a1f046be5", { defaultValue: "🧱 Build something" }); }, action: { kind: 'builder' } },
];

interface QuickActionChipsProps {
  onAction: (action: QuickAction) => void;
}

const QuickActionChips: React.FC<QuickActionChipsProps> = ({ onAction }) => {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scroll}
      style={s.wrapper}
    >
      {CHIPS.map((chip) => {
        const label = chip.labelKey ? `${chip.label} ${t(chip.labelKey)}` : chip.label;
        return (
        <TouchableOpacity
          key={chip.label}
          style={s.chip}
          onPress={() => onAction(chip.action)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text style={s.chipText}>{label}</Text>
        </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const s = StyleSheet.create({
  wrapper: {
    flexGrow: 0,
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
    alignItems: 'center',
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default memo(QuickActionChips);
