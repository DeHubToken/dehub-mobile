import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenHeader from '../ScreenHeader';
import { PROFILE_BAR_HEIGHT, PINNED_PROFILE_TABS_HEIGHT } from './useProfileCollapse';
import { useAppTheme } from '../../context/ThemeContext';
import NavPillSurface from '../ui/NavPillSurface';

export interface CollapsingProfileHeaderProps {
  scrollY: SharedValue<number>;
  tabsPinned: SharedValue<boolean>;
  identityBottom: SharedValue<number>;
  actionsBottom: SharedValue<number>;
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

export default function CollapsingProfileHeader({ scrollY, actionsBottom, tabsPinned, name, handle, cover, canGoBack = true, onBackPress, menu, showFollow, isFollowing, isPending, followLoading, disableFollow, onFollow, onOpenUnfollow }: CollapsingProfileHeaderProps) {
  const { t } = useTranslation();
  const { theme, colors } = useAppTheme();
  const solidTheme = theme === 'system' || theme === 'minimal';
  const [collapsed, setCollapsed] = useState(false);
  const [pinned, setPinned] = useState(false);
  // The material changes at two thresholds, not on every scroll frame.
  const collapsedVisible = useDerivedValue(() => scrollY.value >= actionsBottom.value && !tabsPinned.value);
  useAnimatedReaction(
    () => tabsPinned.value ? 2 : collapsedVisible.value ? 1 : 0,
    (next, previous) => {
      if (next !== previous) {
        runOnJS(setCollapsed)(next === 1);
        runOnJS(setPinned)(next === 2);
      }
    },
  );
  const identity = useAnimatedStyle(() => ({
    opacity: collapsedVisible.value ? 1 : 0,
  }));
  // Switch the opaque material on the UI thread, without a translucent frame.
  const surfaceVisibility = useAnimatedStyle(() => ({
    opacity: collapsedVisible.value ? 1 : 0,
    bottom: 4,
  }));
  const guardVisibility = useAnimatedStyle(() => ({
    opacity: collapsedVisible.value ? 1 : 0,
    bottom: -4,
  }));
  const followLabel = isPending ? t('follow.requested') : isFollowing ? t('filters.following') : t('follow.follow');
  const barVisibility = useAnimatedStyle(() => ({ opacity: tabsPinned.value ? 0 : 1 }));

  return (
    <Animated.View pointerEvents={pinned ? 'none' : 'box-none'} accessibilityElementsHidden={pinned} importantForAccessibility={pinned ? 'no-hide-descendants' : 'auto'} style={[styles.bar, barVisibility]}>
      {solidTheme && (
        <Animated.View pointerEvents="none" style={[styles.gapGuard, { backgroundColor: colors.neutrals[900] }, guardVisibility]} />
      )}
      <Animated.View renderToHardwareTextureAndroid pointerEvents="none" style={[styles.surface, surfaceVisibility]}>
        <NavPillSurface />
      </Animated.View>
      <View className={collapsed ? undefined : 'dark-surface'} pointerEvents="box-none" style={styles.backInset}>
        {!collapsed && canGoBack && <View pointerEvents="none" style={styles.coverBackScrim} />}
        <ScreenHeader overlay plainBack title="" canGoBack={canGoBack} onBackPress={onBackPress} />
      </View>
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
            <LinearGradient colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.025)', 'rgba(0,0,0,0.12)']} locations={[0, 0.45, 1]} style={[StyleSheet.absoluteFill, styles.followSurface]} />
            {followLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text numberOfLines={1} style={styles.followLabel}>{followLabel}</Text>}
          </TouchableOpacity>
        )}
        {menu}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: PROFILE_BAR_HEIGHT, zIndex: 30, elevation: 30 },
  gapGuard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: -4, overflow: 'hidden' },
  surface: { position: 'absolute', top: 4, bottom: 4, left: 8, right: 8, borderRadius: 16, overflow: 'hidden' },
  highlight: { position: 'absolute', top: 0, left: 12, right: 12, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  backInset: { position: 'absolute', top: 2, left: 2, right: 0, height: 56 },
  coverBackScrim: { position: 'absolute', top: 10, left: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)' },
  content: { height: PROFILE_BAR_HEIGHT, paddingLeft: 60, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1, minWidth: 0 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  handle: { color: '#A1A1AA', fontSize: 11, marginTop: 1 },
  follow: { minHeight: 36, minWidth: 76, maxWidth: '44%', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  followSurface: { borderRadius: 12, backgroundColor: 'rgba(8,8,10,0.46)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderTopColor: 'rgba(255,255,255,0.4)' },
  followLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
