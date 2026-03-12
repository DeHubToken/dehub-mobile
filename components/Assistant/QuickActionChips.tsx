import React, { memo, useCallback } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Chip {
  label: string;
  prompt: string;
}

const CHIPS: Chip[] = [
  { label: "What's new?", prompt: "What's new on DeHub?" },
  { label: 'Generate an image', prompt: 'Generate an image of ' },
  { label: 'Edit an image', prompt: 'Edit this image: ' },
  { label: 'Generate a video', prompt: 'Generate a video of ' },
];

interface QuickActionChipsProps {
  onChipPress: (prompt: string) => void;
}

const QuickActionChips: React.FC<QuickActionChipsProps> = ({ onChipPress }) => {
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
          onPress={() => onChipPress(chip.prompt)}
          activeOpacity={0.7}
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
