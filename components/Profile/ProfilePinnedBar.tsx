import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import Avatar from '../common/Avatar';
import Icon from '../ui/Icon';
import NavPillSurface from '../ui/NavPillSurface';
import { useAppTheme } from '../../context/ThemeContext';
import { PROFILE_BAR_HEIGHT } from './useProfileCollapse';

export interface ProfilePinnedIdentity {
  name?: string;
  handle?: string;
  avatarUrl?: string;
  canGoBack?: boolean;
  onBackPress?: () => void;
  showFollow?: boolean;
  isFollowing?: boolean;
  isPending?: boolean;
  followLoading?: boolean;
  disableFollow?: boolean;
  onFollow?: () => void;
  onOpenUnfollow?: () => void;
}

export default function ProfilePinnedBar({ name, handle, avatarUrl, canGoBack = true, onBackPress, showFollow, isFollowing, isPending, followLoading, disableFollow, onFollow, onOpenUnfollow, children }: ProfilePinnedIdentity & { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { skin, colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const foreground = skin?.barIconActive ?? colors.foreground;
  const followLabel = isPending ? t('follow.requested') : isFollowing ? t('filters.following') : t('follow.follow');
  const disabled = !!(disableFollow || followLoading);
  return (
    <View style={styles.outer}>
      <View style={[styles.bar, skin && { borderRadius: skin.barBorder.borderRadius }]}>
        <NavPillSurface />
        {canGoBack && <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.goBack')} onPress={onBackPress} style={styles.back}>
          <Icon name="ArrowLeft" size={20} color={foreground} />
        </TouchableOpacity>}
        <View style={styles.identity} accessible accessibilityLabel={[name, handle].filter(Boolean).join(' ')}>
          <Avatar name={name} uri={avatarUrl} size={32} />
          <View style={{ maxWidth: width >= 600 ? 96 : 76 }}>
            <Text numberOfLines={1} style={[styles.name, { color: foreground }]}>{name}</Text>
            {!!handle && <Text numberOfLines={1} style={[styles.handle, { color: skin?.barIcon ?? colors.mutedForeground }]}>{handle.startsWith('@') ? handle : `@${handle}`}</Text>}
          </View>
        </View>
        {children}
        {showFollow && <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={followLabel}
          accessibilityState={{ disabled, busy: !!followLoading }}
          disabled={disabled} onPress={isFollowing || isPending ? onOpenUnfollow : onFollow}
          activeOpacity={0.7} style={[styles.follow, disabled && { opacity: 0.5 }]}
        >
          {followLoading ? <ActivityIndicator size="small" color={foreground} /> : <Text numberOfLines={1} style={[styles.followLabel, { color: foreground }]}>{followLabel}</Text>}
        </TouchableOpacity>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { height: PROFILE_BAR_HEIGHT, paddingHorizontal: 8, paddingVertical: 4 },
  bar: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 4, borderRadius: 16 },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  name: { fontSize: 14, lineHeight: 17, fontWeight: '700' },
  handle: { fontSize: 10, lineHeight: 13 },
  follow: { height: 36, minWidth: 72, maxWidth: '36%', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.08)' },
  followLabel: { fontSize: 12, fontWeight: '600' },
});
