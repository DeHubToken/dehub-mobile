import React from 'react';
import { useTranslation } from "react-i18next";
import ScreenHeader from '../components/ScreenHeader';
import { View } from 'react-native';
import PostsInfiniteList from '../components/Profile/PostsInfiniteList';
import { useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";

// Screen that shows the user's own posts (videos, feed items)
const YourVideosScreen: React.FC = () => {
  const { t } = useTranslation();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  return (
    <View className="flex-1 bg-theme-neutrals-900"> 
      <ScreenHeader title={t("screens.yourPosts")} />
      <PostsInfiniteList variant="myPosts" bottomPadding={80} />
    </View>
  );
};

export default YourVideosScreen;
