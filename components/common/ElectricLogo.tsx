import React from 'react';
import { Image, Pressable, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import FeedRefreshRing from './FeedRefreshRing';

type Props = { refreshing?: boolean; pullDistance?: SharedValue<number>; source: ImageSourcePropType; width: number; height: number; tint: string; onPress?: () => void; label: string; hint?: string; expanded?: boolean; style?: StyleProp<ViewStyle>; hitSlop?: { top: number; bottom: number; left: number; right: number } };

/** Mobile keeps an intact logo; the refresh ring still reports feed progress. */
export default function ElectricLogo({ refreshing = false, pullDistance, source, width, height, tint, onPress, label, hint, expanded, style, hitSlop }: Props) {
  return <Pressable onPress={onPress} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={expanded === undefined && !refreshing ? undefined : { expanded, busy: refreshing }} style={style}>
    <View pointerEvents="none" style={{ width, height }}>
      <Image source={source} resizeMode="contain" fadeDuration={0} style={{ width, height, tintColor: tint }} />
      <FeedRefreshRing refreshing={refreshing} distance={pullDistance} color={tint} />
    </View>
  </Pressable>;
}
