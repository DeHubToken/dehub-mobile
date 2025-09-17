import React from 'react';
import ScreenHeader from '../components/ScreenHeader';
import { View } from 'react-native';
import CompactVideoInfiniteList from '../components/Home/CompactVideoInfiniteList';
import { useAuth } from '../context/AuthContext';

const LikedVideosScreen: React.FC = () => {
  const { user } = useAuth();
  const address = user?.walletAddress || user?.address || '';
  return (
    <View className="flex-1 bg-black">
      <ScreenHeader title="Liked Videos" />
      <CompactVideoInfiniteList
        address={address}
        bottomPadding={80}
        variant="liked"
      />
    </View>
  );
};

export default LikedVideosScreen;
