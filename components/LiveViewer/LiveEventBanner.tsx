import React, { memo, useEffect, useRef } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Avatar from "../common/Avatar";

export interface EventBannerData {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

interface LiveEventBannerProps {
  /** Latest join event — gets replaced when a new person joins */
  joinEvent: EventBannerData | null;
  /** Latest gift event */
  giftEvent: (EventBannerData & { amount: number; message?: string }) | null;
}

const SHOW_DURATION_MS = 3000;

const BannerRow: React.FC<{
  event: EventBannerData;
  label: string;
  bgClass: string;
  textColor: string;
}> = memo(({ event, label, bgClass, textColor }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-40);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    timerRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 });
      translateX.value = withTiming(-20, { duration: 300 });
    }, SHOW_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [event.id]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animStyle} className={`flex-row items-center self-start ${bgClass} rounded-full px-2.5 py-1 mb-1`}>
      <Avatar uri={event.avatarUrl} size={16} name={event.displayName} />
      <Text style={{ color: textColor }} className="text-[11px] ml-1.5 font-medium" numberOfLines={1}>
        {event.displayName}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.5)' }} className="text-[11px] ml-1">
        {label}
      </Text>
    </Animated.View>
  );
});

const GiftBannerRow: React.FC<{
  event: EventBannerData & { amount: number; message?: string };
}> = memo(({ event }) => {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-40);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    timerRef.current = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 });
      translateX.value = withTiming(-20, { duration: 300 });
    }, SHOW_DURATION_MS + 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [event.id]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={animStyle} className="flex-row items-center self-start bg-theme-yellow-500/20 border border-theme-yellow-400/30 rounded-full px-2.5 py-1 mb-1">
      <Avatar uri={event.avatarUrl} size={16} name={event.displayName} />
      <Text className="text-theme-yellow-300 text-[11px] ml-1.5 font-semibold" numberOfLines={1}>
        {event.displayName}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)' }} className="text-[11px] ml-1">
        sent {event.amount.toLocaleString()} DHB
      </Text>
    </Animated.View>
  );
});

const LiveEventBanner: React.FC<LiveEventBannerProps> = ({ joinEvent, giftEvent }) => {
  if (!joinEvent && !giftEvent) return null;
  return (
    <View className="px-3 mb-1" pointerEvents="none">
      {joinEvent ? (
        <BannerRow
          event={joinEvent}
          label="joined"
          bgClass="bg-black/40"
          textColor="#D4D4D8"
        />
      ) : null}
      {giftEvent ? <GiftBannerRow event={giftEvent} /> : null}
    </View>
  );
};

export default memo(LiveEventBanner);
