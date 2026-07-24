import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

export type ReactionType = 'LIKE' | 'HEART' | 'CELEBRATE' | 'SUPPORT' | 'LAUGH';

const REACTION_EMOJI: Record<ReactionType, string> = {
  LIKE: '👍',
  HEART: '❤️',
  CELEBRATE: '🎉',
  SUPPORT: '✊',
  LAUGH: '😂',
};

export interface FloatingReaction {
  id: string;
  type: ReactionType;
  username?: string;
}

interface FloatingBubbleProps {
  item: FloatingReaction;
  onDone: (id: string) => void;
}

const FloatingBubble: React.FC<FloatingBubbleProps> = memo(({ item, onDone }) => {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(0.4);

  useEffect(() => {
    const xDrift = (Math.random() - 0.5) * 60;
    scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.4)) });
    translateY.value = withTiming(-220 - Math.random() * 80, { duration: 2200, easing: Easing.out(Easing.quad) });
    translateX.value = withTiming(xDrift, { duration: 2200, easing: Easing.inOut(Easing.sin) });
    opacity.value = withDelay(1600, withTiming(0, { duration: 600 }, () => {
      runOnJS(onDone)(item.id);
    }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', bottom: 0, right: 12 + Math.random() * 40 }, style]}
    >
      <Text style={{ fontSize: 28 }}>{REACTION_EMOJI[item.type] || '❤️'}</Text>
    </Animated.View>
  );
});

interface ReactionOverlayProps {
  reactions: FloatingReaction[];
  onRemove: (id: string) => void;
}

const ReactionOverlay: React.FC<ReactionOverlayProps> = ({ reactions, onRemove }) => {
  if (reactions.length === 0) return null;
  return (
    <View pointerEvents="none" className="absolute right-0 bottom-48" style={{ width: 120, height: 300 }}>
      {reactions.map((r) => (
        <FloatingBubble key={r.id} item={r} onDone={onRemove} />
      ))}
    </View>
  );
};

export default memo(ReactionOverlay);
