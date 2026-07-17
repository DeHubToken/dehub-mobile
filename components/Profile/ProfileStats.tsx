import React, { useMemo, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '../../context/AuthContext';
import { formatCompactNumber, resolveCount } from '../../libs/numbers.util';
import { ScreenNames } from '../../navigation/ScreenNames';

interface StatItem { label: string; value: number; key: string }

const ProfileStats: React.FC = () => {
  const user = useUser();
  const navigation = useNavigation<any>();

  const stats = useMemo<StatItem[]>(() => {
    if (!user) return [];
    // followers/followings come back as arrays of addresses from account_info
    // (or a plain number from other endpoints) — resolveCount handles both.
    const followers = resolveCount(user.followers, (user as any).follower_count);
    const following = resolveCount(user.followings, (user as any).following_count);
    // likes can be an array of IDs or a number count from different API responses
    const likes = typeof user.likes === 'number' ? user.likes : (user.likes?.length || 0);
    const receivedTips = user.receivedTips || 0;
    const sentTips = user.sentTips || 0;

    return [
      { key: 'followers', label: 'Followers', value: followers },
      { key: 'following', label: 'Following', value: following },
      { key: 'likes', label: 'Likes', value: likes },
      { key: 'tipsEarned', label: 'Tips earned', value: receivedTips },
      { key: 'tipsGiven', label: 'Tips given', value: sentTips },
    ];
  }, [user]);

  const handleStatPress = useCallback((key: string) => {
    if (!user?.address) return;
    if (key === 'followers' || key === 'following') {
      navigation.navigate(ScreenNames.FollowList, {
        address: user.address,
        username: user.username,
        initialTab: key === 'following' ? 'following' : 'followers',
        hideFollowers: user.hideFollowers,
        isOwnProfile: true,
      });
    }
  }, [user, navigation]);

  if (!stats.length) return null;

  return (
    <View className="flex-row justify-around my-4">
      {stats.map(stat => {
        const isClickable = stat.key === 'followers' || stat.key === 'following';
        
        if (isClickable) {
          return (
            <Pressable
              key={stat.key}
              className="items-center px-3 py-2"
              onPress={() => handleStatPress(stat.key)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="text-lg text-white font-bold">{formatCompactNumber(stat.value)}</Text>
              <Text className="text-xs text-gray-400">{stat.label}</Text>
            </Pressable>
          );
        }
        
        return (
          <View key={stat.key} className="items-center px-3 py-2">
            <Text className="text-lg text-white font-bold">{formatCompactNumber(stat.value)}</Text>
            <Text className="text-xs text-gray-400">{stat.label}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default ProfileStats;
