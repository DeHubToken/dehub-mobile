import React, { memo, useEffect, useMemo } from "react";
import { View, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import type { TipAnimationItem, TipTierKey } from "../../hooks/useTipAnimations";

type Props = {
  items: TipAnimationItem[];
};

const Pill: React.FC<{ text: string; extra?: string }> = memo(({ text, extra }) => {
  return (
    <View className="px-4 py-2 rounded-xl bg-zinc-900/60">
      <Text className="text-white font-semibold text-xs">{text}{extra ? ` • ${extra}` : ""}</Text>
    </View>
  );
});

const useFadeSlide = (duration: number, fromY = 20) => {
  const o = useSharedValue(0);
  const y = useSharedValue(fromY);
  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));
  React.useEffect(() => {
    o.value = withTiming(1, { duration: 250 });
    y.value = withTiming(0, { duration: 250 });
    const exitDelay = Math.max(0, duration - 350);
    o.value = withDelay(exitDelay, withTiming(0, { duration: 250 }));
  }, [duration, o, y]);
  return style;
};

// Golden Screen: gold overlay + coin rain banner
const GoldenScreenEffect: React.FC<{ item: TipAnimationItem; seconds: number }> = memo(({ item, seconds }) => {
  const fade = useFadeSlide(item.durationMs, 0);
  const label = seconds === 10 ? "Golden Screen (10s)" : seconds === 3 ? "Golden Screen (3s)" : "Ultimate Celebration";
  return (
    <Animated.View className="absolute inset-0 items-center justify-center" style={fade}>
      <View className="absolute inset-0 bg-white/10" />
      <Pill text={`${label}`} extra={`${item.amount} DHB`} />
      <View className="absolute top-6 inset-x-0 items-center">
        <Text className="text-white/80 text-base">🪙🪙🪙</Text>
      </View>
      <View className="absolute bottom-10 inset-x-0 items-center">
        <Text className="text-white/80 text-sm">Sirens</Text>
      </View>
    </Animated.View>
  );
});

// Party: confetti + disco ball caption
const PartyEffect: React.FC<{ item: TipAnimationItem }> = memo(({ item }) => {
  const fade = useFadeSlide(item.durationMs);
  return (
    <Animated.View className="absolute inset-0 items-center justify-start pt-14" style={fade}>
      <Pill text="Party Celebration" extra={`${item.amount} DHB`} />
      <Text className="text-white text-lg mt-2">🎊 🎉 🪩</Text>
    </Animated.View>
  );
});

// Spartans: banner text running
const SpartansEffect: React.FC<{ item: TipAnimationItem }> = memo(({ item }) => {
  const fade = useFadeSlide(item.durationMs);
  return (
    <Animated.View className="absolute bottom-20 inset-x-0 items-center" style={fade}>
      <Pill text="Spartans Army" extra={`${item.amount} DHB`} />
      <Text className="text-white text-base mt-2">🛡️⚔️🛡️</Text>
    </Animated.View>
  );
});

// Emoji pop effects for smaller tiers
const EmojiPopEffect: React.FC<{ item: TipAnimationItem; emoji: string; label: string }> = memo(({ item, emoji, label }) => {
  const fade = useFadeSlide(item.durationMs);
  return (
    <Animated.View className="absolute bottom-16 inset-x-0 items-center" style={fade}>
      <Pill text={label} extra={`${item.amount} DHB`} />
      <Text className="text-white text-2xl mt-1">{emoji}</Text>
    </Animated.View>
  );
});

const renderEffectFor = (item: TipAnimationItem) => {
  switch (item.tier) {
    case "ultimate":
      return <GoldenScreenEffect key={item.id} item={item} seconds={10} />;
    case "gold10":
      return <GoldenScreenEffect key={item.id} item={item} seconds={10} />;
    case "gold3":
      return <GoldenScreenEffect key={item.id} item={item} seconds={3} />;
    case "party":
      return <PartyEffect key={item.id} item={item} />;
    case "spartans":
      return <SpartansEffect key={item.id} item={item} />;
    case "magicRing":
      return <EmojiPopEffect key={item.id} item={item} emoji="💍✨" label="Magic Ring" />;
    case "crown":
      return <EmojiPopEffect key={item.id} item={item} emoji="👑" label="Crown" />;
    case "bouquet":
      return <EmojiPopEffect key={item.id} item={item} emoji="💐" label="Bouquet of Flowers" />;
    case "chocolate":
      return <EmojiPopEffect key={item.id} item={item} emoji="🍫" label="Box of Chocolate" />;
    case "heart":
    default:
      return <EmojiPopEffect key={item.id} item={item} emoji="❤️" label="Love Heart" />;
  }
};

const TipAnimationsOverlay: React.FC<Props> = ({ items }) => {
  return <View pointerEvents="none" className="absolute inset-0">{items.map(renderEffectFor)}</View>;
};

export default memo(TipAnimationsOverlay);
