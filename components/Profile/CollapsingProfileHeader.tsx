import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import Animated, { interpolate, Extrapolation, runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../ScreenHeader';
import ChromeSurface from '../ui/ChromeSurface';
import { PROFILE_BAR_HEIGHT } from './useProfileCollapse';

export interface CollapsingProfileHeaderProps {
  scrollY: SharedValue<number>;
  identityBottom: SharedValue<number>;
  name?: string;
  handle?: string;
  cover?: ImageSourcePropType;
  canGoBack?: boolean;
  onBackPress?: () => void;
  menu?: React.ReactNode;
  showFollow?: boolean;
  isFollowing?: boolean;
  isPending?: boolean;
  followLoading?: boolean;
  disableFollow?: boolean;
  onFollow?: () => void;
  onOpenUnfollow?: () => void;
}

export default function CollapsingProfileHeader({ scrollY, identityBottom, name, handle, cover, canGoBack = true, onBackPress, menu, showFollow, isFollowing, isPending, followLoading, disableFollow, onFollow, onOpenUnfollow }: CollapsingProfileHeaderProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => scrollY.value + PROFILE_BAR_HEIGHT >= identityBottom.value,
    (next, previous) => { if (next !== previous) runOnJS(setCollapsed)(next); },
  );
  const identity = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value + PROFILE_BAR_HEIGHT, [identityBottom.value - 12, identityBottom.value], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value + PROFILE_BAR_HEIGHT, [identityBottom.value - 12, identityBottom.value], [4, 0], Extrapolation.CLAMP) }],
  }));
  const followLabel = isPending ? t('follow.requested') : isFollowing ? t('filters.following') : t('follow.follow');

  return (
    <View pointerEvents="box-none" style={styles.bar}>
      <View pointerEvents="none" style={styles.surface}>
        {cover && <Image source={cover} blurRadius={40} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.6, transform: [{ scale: 1.5 }] }]} />}
      </View>
      <ScreenHeader overlay title="" canGoBack={canGoBack} onBackPress={onBackPress} />
      <View pointerEvents="box-none" style={[styles.content, !canGoBack && { paddingLeft: 20 }]}>
        <Animated.View pointerEvents="none" accessibilityElementsHidden={!collapsed} importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'} style={[styles.identity, identity]}>
          <Text numberOfLines={1} style={styles.name}>{name}</Text>
          {!!handle && <Text numberOfLines={1} style={styles.handle}>{handle.startsWith('@') ? handle : `@${handle}`}</Text>}
        </Animated.View>
        {collapsed && showFollow && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={followLabel}
            accessibilityState={{ disabled: !!(disableFollow || followLoading), busy: !!followLoading }}
            disabled={disableFollow || followLoading}
            onPress={isFollowing || isPending ? onOpenUnfollow : onFollow}
            activeOpacity={0.7}
            style={[styles.follow, (disableFollow || followLoading) && { opacity: 0.5 }]}
          >
            <ChromeSurface radius={12} tinted />
            {followLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text numberOfLines={1} style={styles.followLabel}>{followLabel}</Text>}
          </TouchableOpacity>
        )}
        {menu}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: PROFILE_BAR_HEIGHT, zIndex: 30, elevation: 30 },
  surface: { position: 'absolute', top: 4, bottom: 4, left: 8, right: 8, borderRadius: 15, overflow: 'hidden', backgroundColor: '#18181b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  content: { height: PROFILE_BAR_HEIGHT, paddingLeft: 56, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  handle: { color: '#A1A1AA', fontSize: 11, marginTop: 1 },
  follow: { minHeight: 36, minWidth: 76, maxWidth: '44%', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  followLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
