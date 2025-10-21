import React, { useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import GradientIcon from '../components/ui/GradientIcon';

import HomeScreen from '../screens/HomeScreen';
import { ScreenNames } from './ScreenNames';
import FeedScreen from '../screens/FeedScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useNavigation } from '@react-navigation/native';
import UploadScreen from '../screens/UploadScreen';

// Placeholder screens - these will be replaced with actual content later
// remove "const HomeScreen = () => <View style={styles.container}><Text>Home Screen</Text></View>;"
// const FeedScreen = () => <View style={styles.container}><Text>Feed Screen</Text></View>;
// const UploadScreen = () => <View style={styles.container}><Text>Upload Screen</Text></View>;
const DMScreen = () => <View style={styles.container}><Text>DM Screen</Text></View>;
// const ProfileScreen = () => <View style={styles.container}><Text>Profile Screen</Text></View>;

const Tab = createBottomTabNavigator();

function BottomTabNavigator() {
  const navigation = useNavigation<any>();
  const accent = useMemo(() => theme.colors.accent || '#4F8EF7', []);

  const renderIcon = (
    routeName: string,
    focused: boolean,
    size: number,
  ) => {
    let iconNameFilled: keyof typeof Ionicons.glyphMap;
    let iconNameOutline: keyof typeof Ionicons.glyphMap;
    // Use filled for focused and outline for unfocused to match visuals
    if (routeName === ScreenNames.Home) {
      iconNameFilled = 'home';
      iconNameOutline = 'home'; // unchanged
    } else if (routeName === ScreenNames.Feed) {
      // Use albums icon (stacked cards) per design image
      iconNameFilled = 'albums';
      iconNameOutline = 'albums-outline';
    } else if (routeName === ScreenNames.Upload) {
      iconNameFilled = 'add-circle';
      iconNameOutline = 'add-circle'; // unchanged
    } else if (routeName === ScreenNames.DM) {
      // Use chat bubble per design image
      iconNameFilled = 'chatbubble';
      iconNameOutline = 'chatbubble';
    } else if (routeName === ScreenNames.Profile) {
      iconNameFilled = 'person';
      iconNameOutline = 'person'; // unchanged
    } else {
      iconNameFilled = 'ellipse';
      iconNameOutline = 'ellipse';
    }

    const color = '#9CA3AF'; // gray for unfocused icon
    const containerPad = routeName === ScreenNames.Upload ? 10 : 8;
    const containerSize = size + containerPad * 2;
    const radius = containerSize / 2;

    return (
      <View style={[styles.iconWrapper, { width: containerSize, height: containerSize }]} pointerEvents="none">
        {focused ? (
          <View style={[styles.focusBg, { borderRadius: radius }]}>
            <GradientIcon
              name={iconNameFilled}
              size={routeName === ScreenNames.Upload ? size + 6 : size}
              colors={[accent, '#A7C5FF']}
            />
          </View>
        ) : (
          <Ionicons
            name={iconNameOutline}
            size={routeName === ScreenNames.Upload ? size + 4 : size}
            color={color}
          />
        )}
      </View>
    );
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneContainerStyle: { backgroundColor: '#000' },
        tabBarShowLabel: false,
        tabBarIcon: ({ focused, size }) => renderIcon(route.name, focused, size),
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopWidth: 0,
          paddingBottom: 5,
          paddingTop: 10,
          paddingHorizontal: 20,
          height: 70,
        },
      })}
    >
      <Tab.Screen name={ScreenNames.Home} component={HomeScreen} />
      <Tab.Screen name={ScreenNames.Feed} component={FeedScreen} />
      <Tab.Screen
        name={ScreenNames.Upload}
        component={UploadScreen}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate(ScreenNames.Upload);
          },
        }}
      />
      <Tab.Screen name={ScreenNames.DM} component={DMScreen} />
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
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusBg: {
    backgroundColor: 'rgba(156,163,175,0.15)', // gray-400 with transparency
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});

export default BottomTabNavigator;