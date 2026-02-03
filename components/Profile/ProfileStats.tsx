import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useUser } from '../../context/AuthContext';
import { formatCompactNumber } from '../../libs/numbers.util';

interface StatItem { label: string; value: number; key: string }

const ProfileStats: React.FC = () => {
  const user = useUser();

  const stats = useMemo<StatItem[]>(() => {
    if (!user) return [];
    const followers = user.followers?.length || 0;
    const following = user.followings?.length || 0;
    const likes = user.likes?.length || 0;
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

  if (!stats.length) return null;

  return (
    <View className="flex-row justify-around my-4">
      {stats.map(stat => (
        <View key={stat.key} className="items-center">
          <Text className="text-lg text-white font-bold">{formatCompactNumber(stat.value)}</Text>
          <Text className="text-xs text-gray-400">{stat.label}</Text>
        </View>
      ))}
    </View>
  );
};

export default ProfileStats;
