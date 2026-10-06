import React, { useEffect } from "react";
import { View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { useIsOnline } from "../../libs/online-presence";

const GREEN = "#34d399";

/**
 * Glowing green dot beside a name on Messages. Renders nothing unless that
 * person turned on "Show when I'm online" and has the app open — see
 * libs/online-presence. Twin of web's components/app/chat/OnlineDot.
 */
export default function OnlineDot({ address }: { address?: string | null }) {
  const { t } = useTranslation();
  // Messages is preloaded behind Home. An endless pulse there kept Android's
  // UI thread committing a frame for a dot nobody could see, through every
  // frame of a feed scroll; it runs only while its screen is in front.
  const focused = useIsFocused();
  const isOnline = useIsOnline(address, focused);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!isOnline || !focused) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [isOnline, focused, pulse]);

  const halo = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.2 }],
  }));

  if (!isOnline) return null;
  return (
    <View
      accessible
      accessibilityLabel={t("dm.online")}
      style={{ width: 8, height: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <Animated.View
        style={[{ position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN }, halo]}
      />
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: GREEN,
          shadowColor: GREEN,
          shadowOpacity: 0.9,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
          elevation: 3,
        }}
      />
    </View>
  );
}
