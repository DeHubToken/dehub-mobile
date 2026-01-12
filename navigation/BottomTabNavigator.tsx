import React, { useMemo, useState, useCallback } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import GradientIcon from "../components/ui/GradientIcon";
import FeedIcon from "../components/ui/FeedIcon";
import HomeScreen from "../screens/HomeScreen";
import FeedScreen from "../screens/FeedScreen";
import ProfileScreen from "../screens/ProfileScreen";
import UploadScreen from "../screens/UploadScreen";
import DirectMessagesScreen from "../screens/DirectMessagesScreen";
import { ScreenNames } from "./ScreenNames";
import type { BottomTabParamList, AppStackNavigationProp } from "./types";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { useUnreadConversationsCount } from "../store/dm.state";

const Tab = createBottomTabNavigator<BottomTabParamList>();

function BottomTabNavigator() {
  const navigation = useNavigation<AppStackNavigationProp<typeof ScreenNames.Root>>();
  const { isSignedIn, needsUsername, user } = useAuth();
  const isAuthed = isSignedIn && !needsUsername;
  const accent = useMemo(() => theme.colors.accent || "#4F8EF7", []);
  const unreadConvs = useUnreadConversationsCount((user as any)?.id);
  const [currentTab, setCurrentTab] = useState<string>(ScreenNames.Home);

  const renderIcon = useCallback((routeName: string, focused: boolean, size: number) => {
    let iconNameFilled: keyof typeof Ionicons.glyphMap;
    let iconNameOutline: keyof typeof Ionicons.glyphMap;
    
    // Special case for Feed icon - use custom component
    if (routeName === ScreenNames.Feed) {
      const containerPad = 8;
      const containerSize = size + containerPad * 2;
      const radius = containerSize / 2;
      
      return (
        <View
          style={[
            styles.iconWrapper,
            { width: containerSize, height: containerSize },
          ]}
          pointerEvents="none"
        >
          {focused ? (
            <View style={[styles.focusBg, { borderRadius: radius }]}>
              <FeedIcon size={size} focused={true} />
            </View>
          ) : (
            <FeedIcon size={size} color="#9CA3AF" focused={false} />
          )}
        </View>
      );
    }
    
    // Use filled for focused and outline for unfocused to match visuals
    if (routeName === ScreenNames.Home) {
      iconNameFilled = "home";
      iconNameOutline = "home"; // unchanged
    } else if (routeName === ScreenNames.UploadTab) {
      iconNameFilled = "add-circle";
      iconNameOutline = "add-circle"; // unchanged
    } else if (routeName === ScreenNames.DM) {
      // Use chat bubble per design image
      iconNameFilled = "chatbubble";
      iconNameOutline = "chatbubble";
    } else if (routeName === ScreenNames.Profile) {
      iconNameFilled = "person";
      iconNameOutline = "person"; // unchanged
    } else {
      iconNameFilled = "ellipse";
      iconNameOutline = "ellipse";
    }

    const color = "#9CA3AF"; // gray for unfocused icon
    const containerPad = routeName === ScreenNames.UploadTab ? 10 : 8;
    const containerSize = size + containerPad * 2;
    const radius = containerSize / 2;

    return (
      <View
        style={[
          styles.iconWrapper,
          { width: containerSize, height: containerSize },
        ]}
        pointerEvents="none"
      >
        {focused ? (
          <View style={[styles.focusBg, { borderRadius: radius }]}>
            <GradientIcon
              name={iconNameFilled}
              size={routeName === ScreenNames.UploadTab ? size + 6 : size}
              colors={[accent, "#A7C5FF"]}
            />
          </View>
        ) : (
          <Ionicons
            name={iconNameOutline}
            size={routeName === ScreenNames.UploadTab ? size + 4 : size}
            color={color}
          />
        )}
        {routeName === ScreenNames.DM && isAuthed && unreadConvs > 0 ? (
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>
              {unreadConvs > 4 ? "4+" : String(unreadConvs)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }, [accent, isAuthed, unreadConvs]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneContainerStyle: { backgroundColor: "#000" },
        tabBarShowLabel: false,
        tabBarIcon: ({ focused, size }) =>
          renderIcon(route.name, focused, size),
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopWidth: 0,
          paddingBottom: 5,
          paddingTop: 10,
          paddingHorizontal: 20,
          height: 70,
        },
      })}
      screenListeners={{
        state: (e) => {
          const state = e.data.state;
          if (state && state.index !== undefined && state.routes) {
            const activeRoute = state.routes[state.index];
            if (activeRoute?.name) {
              setCurrentTab(activeRoute.name);
            }
          }
        },
      }}
    >
      <Tab.Screen name={ScreenNames.Home} component={HomeScreen} />
      <Tab.Screen name={ScreenNames.Feed} component={FeedScreen} />
      {isAuthed && (
        <Tab.Screen
          name={ScreenNames.UploadTab}
          component={UploadScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              const uploadTab = currentTab === ScreenNames.Feed ? 'feed' : undefined;
              navigation.navigate(ScreenNames.Upload, { tab: uploadTab });
            },
          }}
        />
      )}
      {isAuthed && (
        <Tab.Screen name={ScreenNames.DM} component={DirectMessagesScreen} />
      )}
      <Tab.Screen name={ScreenNames.Profile} component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background, // Dark background for screens
  },
  iconWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  focusBg: {
    backgroundColor: "rgba(156,163,175,0.15)", // gray-400 with transparency
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  badgeContainer: {
    position: "absolute",
    right: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#ef4444", // red-500
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
});

export default BottomTabNavigator;
