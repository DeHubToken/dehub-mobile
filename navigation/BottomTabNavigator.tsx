import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import { ScreenNames } from './ScreenNames';
import FeedScreen from '../screens/FeedScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Placeholder screens - these will be replaced with actual content later
// remove "const HomeScreen = () => <View style={styles.container}><Text>Home Screen</Text></View>;"
// const FeedScreen = () => <View style={styles.container}><Text>Feed Screen</Text></View>;
const UploadScreen = () => <View style={styles.container}><Text>Upload Screen</Text></View>;
// const DMScreen = () => <View style={styles.container}><Text>DM Screen</Text></View>;
// const ProfileScreen = () => <View style={styles.container}><Text>Profile Screen</Text></View>;

const Tab = createBottomTabNavigator();

function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === ScreenNames.Home) {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === ScreenNames.Feed) {
            iconName = focused ? 'compass' : 'compass-outline';
          } else if (route.name === ScreenNames.Upload) {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
          } else if (route.name === ScreenNames.DM) {
            iconName = focused ? 'chatbox' : 'chatbox-outline';
          } else if (route.name === ScreenNames.Profile) {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-circle-outline'; // Default or fallback icon
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopWidth: 0, // Remove top border
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
      })}
    >
      <Tab.Screen name={ScreenNames.Home} component={HomeScreen} />
      {/* <Tab.Screen name={ScreenNames.Feed} component={FeedScreen} /> */}
      <Tab.Screen name={ScreenNames.Upload} component={UploadScreen} />
      {/* <Tab.Screen name={ScreenNames.DM} component={DMScreen} /> */}
      <Tab.Screen name={ScreenNames.Profile} component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background, // Dark background for screens
  },
});

export default BottomTabNavigator;