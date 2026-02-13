import React, { memo, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { ReactionType } from './ReactionOverlay';

const REACTION_OPTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'LIKE', emoji: '👍', label: 'Like' },
  { type: 'HEART', emoji: '❤️', label: 'Heart' },
  { type: 'CELEBRATE', emoji: '🎉', label: 'Celebrate' },
  { type: 'SUPPORT', emoji: '✊', label: 'Support' },
  { type: 'LAUGH', emoji: '😂', label: 'Laugh' },
];

interface ReactionBarProps {
  onReact: (type: ReactionType) => void;
  disabled?: boolean;
}

const COOLDOWN_MS = 500;

const ReactionBar: React.FC<ReactionBarProps> = ({ onReact, disabled }) => {
  const lastTapRef = useRef<number>(0);

  const handlePress = useCallback((type: ReactionType) => {
    const now = Date.now();
    if (now - lastTapRef.current < COOLDOWN_MS) return;
    lastTapRef.current = now;
    onReact(type);
  }, [onReact]);

  return (
    <View className="flex-row items-center justify-center py-2 px-4">
      {REACTION_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.type}
          onPress={() => handlePress(opt.type)}
          disabled={disabled}
          activeOpacity={0.7}
          className={`mx-2 w-10 h-10 rounded-full items-center justify-center bg-white/10 border border-white/10 ${disabled ? 'opacity-40' : ''}`}
        >
          <Text style={{ fontSize: 18 }}>{opt.emoji}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default memo(ReactionBar);
