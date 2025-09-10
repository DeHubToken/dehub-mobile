import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import ProfileTabs from '../components/Profile/ProfileTabs';

// Screen that hosts the old profile tab content (videos, feed, activity, livestreams)
// Reuses ProfileTabs with its own header.
const YourVideosScreen: React.FC = () => {
  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top','bottom']}> 
      <ScreenHeader title="Your Videos" />
      <ProfileTabs />
    </SafeAreaView>
  );
};

export default YourVideosScreen;
