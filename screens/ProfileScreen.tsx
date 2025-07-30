import React from 'react';
import { View, ScrollView, SafeAreaView } from 'react-native';
import ProfileHeader from '../components/Profile/ProfileHeader';
import ProfileStats from '../components/Profile/ProfileStats';
import ProfileAssets from '../components/Profile/ProfileAssets';
import ProfileTabs from '../components/Profile/ProfileTabs';

const ProfileScreen = () => {
  return (
    <SafeAreaView className="flex-1 bg-theme-neutrals-900">
      <ScrollView>
        <ProfileHeader />
        {/* <ProfileStats />
        <ProfileAssets />
        <ProfileTabs /> */}
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileScreen;
