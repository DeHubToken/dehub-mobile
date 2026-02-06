import React from 'react';
import ScreenHeader from '../components/ScreenHeader';
import { View } from 'react-native';
import PostsInfiniteList from '../components/Profile/PostsInfiniteList';
import { useAuth } from '../context/AuthContext';
import { useGateToHome } from "../hooks/useGateToHome";

// Screen that shows posts the user has liked
const LikedVideosScreen: React.FC = () => {
  const { isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Liked Posts" />
      <PostsInfiniteList variant="liked" bottomPadding={80} />
    </View>
  );
};

export default LikedVideosScreen;
