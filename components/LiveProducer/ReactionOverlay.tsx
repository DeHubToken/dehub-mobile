import React, { memo, useEffect } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useReducedMotion,
  withTiming, cancelAnimation, Easing,
} from 'react-native-reanimated';
import {
  LIVE_REACTION_EMOJI, REACTION_LANE_WIDTH, REACTION_MOTION, REACTION_SIZE, REACTION_SIZE_BIG,
  reactionColumn, reactionPose,
  type LiveReactionType, type ReactionParticle,
} from '../../libs/live-reaction-flow';

export type ReactionType = LiveReactionType;
export type FloatingReaction = ReactionParticle;

/** One emoji on its climb. Driven by reactionPose, the same curve web draws. */
const FloatingBubble = memo(({ item, laneHeight }: { item: FloatingReaction; laneHeight: number }) => {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const seed = Number(item.id);
  const size = item.big ? REACTION_SIZE_BIG : REACTION_SIZE;
  const climb = Math.max(120, laneHeight - size);
  useEffect(() => {
    progress.value = withTiming(1, { duration: REACTION_MOTION[item.type].duration, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [progress, item.type]);
  const style = useAnimatedStyle(() => {
    const pose = reactionPose(item.type, seed, progress.value);
    if (reducedMotion) return { opacity: pose.opacity };
    return {
      opacity: pose.opacity,
      transform: [
        { translateY: -pose.rise * climb },
        { translateX: pose.x },
        { rotate: `${pose.rotate}deg` },
        { scale: pose.scale },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', bottom: 0, right: reactionColumn(seed) }, style]}>
    <Text style={{ fontSize: size, lineHeight: size * 1.2, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } }}>
      {LIVE_REACTION_EMOJI[item.type]}
    </Text>
  </Animated.View>;
});

const ReactionOverlay = ({ reactions, bottom = 100, maxHeight }: {
  reactions: FloatingReaction[];
  onRemove?: (id: string) => void;
  bottom?: number;
  /** Cap for the lane; defaults to about half the screen. */
  maxHeight?: number;
}) => {
  const { height } = useWindowDimensions();
  const laneHeight = Math.min(maxHeight ?? 400, Math.round(height * 0.5));
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', right: 4, bottom, width: REACTION_LANE_WIDTH, height: laneHeight, overflow: 'hidden' }}>
      {reactions.map(item => <FloatingBubble key={item.id} item={item} laneHeight={laneHeight} />)}
    </View>
  );
};

export default memo(ReactionOverlay);
