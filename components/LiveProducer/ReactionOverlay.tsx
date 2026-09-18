import React, { memo, useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useReducedMotion,
  withTiming, withDelay, withSequence, cancelAnimation, Easing,
} from 'react-native-reanimated';
import { LIVE_REACTION_EMOJI, type LiveReactionType, type ReactionParticle } from '../../libs/live-reaction-flow';

export type ReactionType = LiveReactionType;
export type FloatingReaction = ReactionParticle;

const FloatingBubble = memo(({ item }: { item: FloatingReaction }) => {
  const progress = useSharedValue(0);
  const scale = useSharedValue(0.6);
  const reducedMotion = useReducedMotion();
  const seed = Number(item.id);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1500, easing: Easing.linear });
    scale.value = reducedMotion ? 1 : withSequence(
      withTiming(1, { duration: 180 }),
      withDelay(1095, withTiming(1.15, { duration: 75 })),
      withTiming(0, { duration: 150 }),
    );
    return () => { cancelAnimation(progress); cancelAnimation(scale); };
  }, [progress, scale, reducedMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.12 ? progress.value / 0.12 : Math.min(1, (1 - progress.value) / 0.15),
    transform: [
      { translateY: reducedMotion ? 0 : -120 * progress.value },
      { translateX: reducedMotion ? 0 : (seed % 5 - 2) * 7 * progress.value },
      { scale: scale.value },
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', bottom: 4, right: 12 + seed % 4 * 10 }, style]}>
    <Text style={{ fontSize: 22 }}>{LIVE_REACTION_EMOJI[item.type]}</Text>
  </Animated.View>;
});

const ReactionOverlay = ({ reactions, bottom = 100 }: {
  reactions: FloatingReaction[];
  onRemove?: (id: string) => void;
  bottom?: number;
}) => (
  <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: 'absolute', right: 12, bottom, width: 96, height: 176, overflow: 'hidden' }}>
    {reactions.map(item => <FloatingBubble key={item.id} item={item} />)}
  </View>
);

export default memo(ReactionOverlay);
