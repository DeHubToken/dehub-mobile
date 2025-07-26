import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

import HomeScreen from '../screens/HomeScreen';
import FeedScreen from '../screens/FeedScreen';
import UploadScreen from '../screens/UploadScreen';
import DMScreen from '../screens/DMScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Placeholder screens
const Tab = createBottomTabNavigator();

function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Feed') {
            iconName = focused ? 'compass' : 'compass-outline';
          } else if (route.name === 'Upload') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
          } else if (route.name === 'DM') {
            iconName = focused ? 'chatbox' : 'chatbox-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-circle-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Upload" component={UploadScreen} />
      <Tab.Screen name="DM" component={DMScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default BottomTabNavigator;

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  screenText: {
    color: theme.colors.foreground,
    fontSize: 16,
  },
  tabBar: {
    backgroundColor: theme.colors.card,
    borderTopWidth: 0,
    paddingBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    height: 60,
  },
  tabLabel: {
    fontSize: 12,
  },
});