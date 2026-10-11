import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { useCinematicPhone } from '../../hooks/useCinematicPhone';
import { MINIMAL_HAIRLINE } from '../../theme/minimal';

// Skeleton placeholder matching the current UserProfileHeader layout
const UserProfileSkeleton: React.FC = () => {
  const { isMinimal } = useAppTheme();
  const cinematicPhone = useCinematicPhone();
  return (
    <View>
      {/* Cover image */}
      {/* Match the full-width cover while the profile loads. */}
      <View
        className={isMinimal || cinematicPhone ? 'overflow-hidden' : 'rounded-t-xl overflow-hidden'}
        style={{ height: 140 }}
      >
        <View className="w-full h-full bg-theme-neutrals-800 animate-pulse" />
      </View>

      <View className={cinematicPhone ? 'px-4' : 'px-5'}>
        {/* Avatar + follow button row */}
        <View className="flex-row items-start justify-between" style={{ marginTop: -44 }}>
          <View
            className="animate-pulse"
            style={{ width: 88, height: 88, borderRadius: 12, borderWidth: 3, borderColor: '#18181b', backgroundColor: '#18181b' }}
          />
          {/* Minimal's header button is a 44pt hairline outline, not a slab. */}
          {isMinimal ? (
            <View
              className={`w-24 self-start mt-12 animate-pulse ${cinematicPhone ? '-mr-3' : '-mr-4'}`}
              style={{ height: 44, borderWidth: 1, borderColor: MINIMAL_HAIRLINE }}
            />
          ) : (
            <View className={`h-9 w-24 bg-theme-neutrals-800 rounded-xl self-start mt-12 animate-pulse ${cinematicPhone ? '-mr-3' : '-mr-4'}`} />
          )}
        </View>

        {/* Name + social icons row */}
        <View className="mt-2 flex-row items-center justify-between">
          <View className="h-6 w-36 bg-theme-neutrals-700 rounded animate-pulse" />
          <View className="flex-row gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} className="w-8 h-8 rounded-xl bg-theme-neutrals-800 animate-pulse" />
            ))}
          </View>
        </View>

        {/* @username */}
        <View className="mt-1.5 h-4 w-24 bg-theme-neutrals-800 rounded animate-pulse" />

        {/* Bio */}
        <View className="mt-3 space-y-1.5">
          <View className="h-3.5 w-full bg-theme-neutrals-800 rounded animate-pulse" />
          <View className="h-3.5 w-3/4 bg-theme-neutrals-800 rounded animate-pulse" />
        </View>

        {/* Joined date */}
        <View className="mt-3 h-3.5 w-28 bg-theme-neutrals-800 rounded animate-pulse" />

        {/* Following / Followers */}
        <View className="flex-row items-center gap-4 mt-3">
          <View className="h-4 w-20 bg-theme-neutrals-800 rounded animate-pulse" />
          <View className="h-4 w-20 bg-theme-neutrals-800 rounded animate-pulse" />
        </View>
      </View>
    </View>
  );
};

export default UserProfileSkeleton;
