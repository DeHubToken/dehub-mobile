import React, { useState } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { theme } from '../../theme';

import VideosRoute from './VideosRoute';
import FeedRoute from './FeedRoute';
import ActivityRoute from './ActivityRoute';
import LivestreamsRoute from './LivestreamsRoute';

const initialLayout = { width: Dimensions.get('window').width };

const renderScene = SceneMap({
  videos: VideosRoute,
  feed: FeedRoute,
  activity: ActivityRoute,
  livestreams: LivestreamsRoute,
});

const ProfileTabs: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'videos', title: 'Videos' },
    { key: 'feed', title: 'Feed' },
    { key: 'activity', title: 'Activity' },
    { key: 'livestreams', title: 'Livestreams' },
  ]);

  const renderTabBar = (props) => (
    <TabBar
      {...props}
      indicatorStyle={{
        backgroundColor: theme.colors.accent,
        height: 2,
      }}
      style={{
        backgroundColor: 'transparent',
      }}
      tabStyle={{
        width: 'auto',
        minWidth: 80,
      }}
      scrollEnabled={true}
      renderLabel={({ route, focused }) => (
        <Text
          className={`text-sm font-medium text-center ${
            focused ? 'text-theme-accent font-semibold' : 'text-white'
          }`}
        >
          {route.title}
        </Text>
      )}
      pressColor={theme.colors.accent + '20'}
      activeColor={theme.colors.accent}
      inactiveColor="white"
    />
  );

  return (
    <View className="flex-1 bg-black border-b border-gray-700" style={{ height: 400 }}>
      <TabView
        navigationState={{ index, routes }}
        renderScene={renderScene}
        onIndexChange={setIndex}
        initialLayout={initialLayout}
        renderTabBar={renderTabBar}
        className="flex-1"
      />
    </View>
  );
};

export default ProfileTabs;