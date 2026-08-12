import React, { memo } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

/**
 * The row under the welcome message.
 *
 * Same seven actions as web's, in the same order. Three of them are not
 * prompts — Poster, Song and Build open a flow directly — so each chip carries
 * an `action` and the screen decides, rather than every chip stuffing text into
 * the composer as they all used to here.
 */
export type QuickAction =
  | { kind: 'prompt'; text: string }
  | { kind: 'poster' }
  | { kind: 'song' }
  | { kind: 'edit-image' }
  | { kind: 'builder' };

interface Chip {
  label: string;
  action: QuickAction;
}

const CHIPS: Chip[] = [
  { label: "📰 What's new?", action: { kind: 'prompt', text: "What's new on DeHub?" } },
  { label: '🎨 Make DeHub Poster', action: { kind: 'poster' } },
  { label: '🖼️ Generate image', action: { kind: 'prompt', text: 'Generate an image of ' } },
  { label: '✏️ Edit image', action: { kind: 'edit-image' } },
  { label: '🎥 Generate video', action: { kind: 'prompt', text: 'Generate a video of ' } },
  { label: '🎵 Create a song', action: { kind: 'song' } },
  { label: '🧱 Build something', action: { kind: 'builder' } },
];

interface QuickActionChipsProps {
  onAction: (action: QuickAction) => void;
}

const QuickActionChips: React.FC<QuickActionChipsProps> = ({ onAction }) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.scroll}
      style={s.wrapper}
    >
      {CHIPS.map((chip) => (
        <TouchableOpacity
          key={chip.label}
          style={s.chip}
          onPress={() => onAction(chip.action)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={chip.label}
        >
          <Text style={s.chipText}>{chip.label}</Text>
        </TouchableOpacity>
      ))}
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
    borderRadius: 20,
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
