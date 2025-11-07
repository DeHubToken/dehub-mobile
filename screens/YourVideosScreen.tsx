import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import ProfileTabs from '../components/Profile/ProfileTabs';
import { View } from 'react-native';
import { useAuth } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";

// Screen that hosts the old profile tab content (videos, feed, activity, livestreams)
// Reuses ProfileTabs with its own header.
const YourVideosScreen: React.FC = () => {
  const { isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  return (
    <View className="flex-1 bg-black"> 
      <ScreenHeader title="Your Videos" />
      <ProfileTabs />
    </View>
  );
};

export default YourVideosScreen;
