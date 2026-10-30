import SkeletonBlock from '../Feed/SkeletonBlock';
import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Avatar from '../common/Avatar';
import BadgeArtwork from '../common/BadgeArtwork';
import { getBadgeHoverOpticalStyle } from '../../libs/misc';
import { openBadgeShowcase, tierForBadgeImage } from '../../libs/badgeShowcase';
import type { ProfileIdentitySeed } from '../../hooks/useUserProfileData';
import { useAppTheme } from '../../context/ThemeContext';
import { useCinematicPhone } from '../../hooks/useCinematicPhone';
import { MINIMAL_HAIRLINE } from '../../theme/minimal';

// Skeleton placeholder matching the current UserProfileHeader layout. With a
// seed from the tapped card it draws the real avatar, name and badge in their
// final places, and the badge opens its showcase straight away.
const UserProfileSkeleton: React.FC<{ seed?: ProfileIdentitySeed | null }> = ({ seed }) => {
  const { isMinimal, colors } = useAppTheme();
  const cinematicPhone = useCinematicPhone();
  const badgeRef = useRef<View>(null);
  const seedAvatar = seed?.avatarUrl && seed.avatarUrl !== 'default-avatar' ? seed.avatarUrl : undefined;
  const hasIdentity = !!(seed?.displayName || seedAvatar);
  return (
    <View>
      {/* Cover image */}
      {/* Match the full-width cover while the profile loads. */}
      <View
        className={isMinimal || cinematicPhone ? 'overflow-hidden' : 'rounded-t-xl overflow-hidden'}
        style={{ height: 140 }}
      >
        <SkeletonBlock className="w-full h-full animate-pulse" />
      </View>

      <View className={cinematicPhone ? 'px-4' : 'px-5'}>
        {/* Avatar + follow button row */}
        <View className="flex-row items-start justify-between" style={{ marginTop: -44 }}>
          {hasIdentity ? (
            <Avatar
              uri={seedAvatar}
              name={seed?.displayName}
              size={88}
              style={{ borderWidth: 1.5, borderColor: '#18181b', backgroundColor: '#18181b' }}
            />
          ) : (
            <SkeletonBlock
              className="animate-pulse"
              style={{ width: 88, height: 88, borderRadius: 12, borderWidth: 3, borderColor: colors.background }}
            />
          )}
          {/* Minimal's header button is a 44pt hairline outline, not a slab. */}
          {isMinimal ? (
            <View
              className={`w-24 self-start mt-12 animate-pulse ${cinematicPhone ? '-mr-3' : '-mr-4'}`}
              style={{ height: 44, borderWidth: 1, borderColor: MINIMAL_HAIRLINE }}
            />
          ) : (
            <SkeletonBlock className={`h-9 w-24 rounded-xl self-start mt-12 animate-pulse ${cinematicPhone ? '-mr-3' : '-mr-4'}`} />
          )}
        </View>

        {/* Name + social icons row */}
        <View className="mt-2 flex-row items-center justify-between">
          {seed?.displayName ? (
            <View className="flex-row items-center gap-1.5" style={{ flexShrink: 1 }}>
              <Text className="text-white text-xl font-bold" numberOfLines={1} style={{ flexShrink: 1 }}>{seed.displayName}</Text>
              {seed.badgeImage ? (
                <Pressable
                  ref={badgeRef}
                  testID="profile-skeleton-badge"
                  style={{ alignSelf: 'flex-end', height: 28, justifyContent: 'center' }}
                  hitSlop={8}
                  onPress={() => openBadgeShowcase(tierForBadgeImage(seed.badgeImage), badgeRef.current)}
                >
                  <BadgeArtwork source={seed.badgeImage} style={[getBadgeHoverOpticalStyle(seed.badgeImage, 20), { marginLeft: 0 }]} contentFit="contain" />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <SkeletonBlock className="h-6 w-36 rounded animate-pulse" />
          )}
          <View className="flex-row gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBlock key={i} className="w-8 h-8 rounded-xl animate-pulse" />
            ))}
          </View>
        </View>

        {/* @username */}
        <SkeletonBlock className="mt-1.5 h-4 w-24 rounded animate-pulse" />

        {/* Bio */}
        <View className="mt-3 space-y-1.5">
          <SkeletonBlock className="h-3.5 w-full rounded animate-pulse" />
          <SkeletonBlock className="h-3.5 w-3/4 rounded animate-pulse" />
        </View>

        {/* Joined date */}
        <SkeletonBlock className="mt-3 h-3.5 w-28 rounded animate-pulse" />

        {/* Following / Followers */}
        <View className="flex-row items-center gap-4 mt-3">
          <SkeletonBlock className="h-4 w-20 rounded animate-pulse" />
          <SkeletonBlock className="h-4 w-20 rounded animate-pulse" />
        </View>
      </View>
    </View>
  );
};

export default UserProfileSkeleton;
