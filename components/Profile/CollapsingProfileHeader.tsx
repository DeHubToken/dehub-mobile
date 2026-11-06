import React, { useState } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import ScreenHeader from '../ScreenHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { PROFILE_BAR_HEIGHT } from './useProfileCollapse';

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

/** Floating Back over the cover, on a squared dark chip so it reads on white
 *  banners too, until the tab row pins and carries its own
 *  Back and Follow. There is no compact name bar in between. */
export default function CollapsingProfileHeader({ tabsPinned, canGoBack = true, onBackPress, menu }: CollapsingProfileHeaderProps) {
  const { skin } = useAppTheme();
  const [pinned, setPinned] = useState(false);
  useAnimatedReaction(
    () => tabsPinned.value,
    (next, previous) => {
      if (next !== previous) runOnJS(setPinned)(next);
    },
  );
  const barVisibility = useAnimatedStyle(() => ({ opacity: tabsPinned.value ? 0 : 1 }));

  return (
    <Animated.View pointerEvents={pinned ? 'none' : 'box-none'} accessibilityElementsHidden={pinned} importantForAccessibility={pinned ? 'no-hide-descendants' : 'auto'} style={[styles.bar, barVisibility]}>
      <View className="dark-surface" pointerEvents="box-none" style={styles.backInset}>
        {canGoBack && <View pointerEvents="none" style={[styles.coverBackScrim, skin?.square && { borderRadius: 0 }]} />}
        <ScreenHeader overlay plainBack title="" canGoBack={canGoBack} onBackPress={onBackPress} />
      </View>
      {!!menu && <View pointerEvents="box-none" style={styles.content}>{menu}</View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, height: PROFILE_BAR_HEIGHT, zIndex: 30, elevation: 30 },
  backInset: { position: 'absolute', top: 2, left: 2, right: 0, height: 56 },
  coverBackScrim: { position: 'absolute', top: 10, left: 10, width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(10,10,12,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  content: { height: PROFILE_BAR_HEIGHT, paddingRight: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
});
