import SkeletonBlock from '../Feed/SkeletonBlock';
import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { useCinematicPhone } from '../../hooks/useCinematicPhone';
import { MINIMAL_HAIRLINE } from '../../theme/minimal';

// Skeleton placeholder matching the current UserProfileHeader layout
const UserProfileSkeleton: React.FC = () => {
  const { isMinimal, colors } = useAppTheme();
  const cinematicPhone = useCinematicPhone();
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
          <SkeletonBlock
            className="animate-pulse"
            style={{ width: 88, height: 88, borderRadius: 12, borderWidth: 3, borderColor: colors.background }}
          />
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
          <SkeletonBlock className="h-6 w-36 rounded animate-pulse" />
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
