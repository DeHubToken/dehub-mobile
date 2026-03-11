import React, { useState, useCallback } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, StyleSheet } from "react-native";
import AppDrawer from "../components/Home/AppDrawer";
import FloatingBottomTabBar from "./FloatingBottomTabBar";
import HomeScreen from "../screens/HomeScreen";
import DirectMessagesScreen from "../screens/DirectMessagesScreen";
import UploadScreen from "../screens/UploadScreen";
import AIChatScreen from "../screens/AIChatScreen";
import ExploreScreen from "../screens/ExploreScreen";
import { ScreenNames } from "./ScreenNames";
import type { BottomTabParamList, AppStackNavigationProp } from "./types";
import { useNavigation } from "@react-navigation/native";
import { useAuthState } from "../context/AuthContext";
import { DrawerProvider, useDrawer } from "../context/DrawerContext";

const Tab = createBottomTabNavigator<BottomTabParamList>();

function BottomTabNavigator() {
  const navigation = useNavigation<AppStackNavigationProp<typeof ScreenNames.Root>>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;
  const [currentTab, setCurrentTab] = useState<string>(ScreenNames.Home);

  const { drawerOpen, closeDrawer } = useDrawer();

  const renderTabBar = useCallback(
    (props: any) => <FloatingBottomTabBar {...props} />,
    [],
  );

  return (
    <View style={styles.root}>
      <Tab.Navigator
        tabBar={renderTabBar}
        screenOptions={{
          headerShown: false,
          sceneContainerStyle: { backgroundColor: "#000" },
          tabBarShowLabel: false,
        }}
        screenListeners={{
          state: (e) => {
            const navState = e.data.state;
            if (navState && navState.index !== undefined && navState.routes) {
              const activeRoute = navState.routes[navState.index];
              if (activeRoute?.name) {
                setCurrentTab(activeRoute.name);
              }
            }
          },
        }}
      >
        <Tab.Screen name={ScreenNames.Home} component={HomeScreen} />
        <Tab.Screen name={ScreenNames.DM} component={DirectMessagesScreen} />
        <Tab.Screen
          name={ScreenNames.UploadTab}
          component={UploadScreen}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              if (!isAuthed) {
                navigation.navigate(ScreenNames.SignIn);
                return;
              }
              const uploadTab = currentTab === ScreenNames.Home ? undefined : undefined;
              navigation.navigate(ScreenNames.Upload, { tab: uploadTab });
            },
          }}
        />
        <Tab.Screen name={ScreenNames.AIChat} component={AIChatScreen} />
        <Tab.Screen name={ScreenNames.Explore} component={ExploreScreen} />
      </Tab.Navigator>
      <AppDrawer visible={drawerOpen} onClose={closeDrawer} />
    </View>
  );
}

function BottomTabNavigatorWithDrawer() {
  return (
    <DrawerProvider>
      <BottomTabNavigator />
    </DrawerProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default BottomTabNavigatorWithDrawer;
