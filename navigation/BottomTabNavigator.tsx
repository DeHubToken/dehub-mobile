import React, { useCallback } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, StyleSheet } from "react-native";
import AppDrawer from "../components/Home/AppDrawer";
import FloatingBottomTabBar from "./FloatingBottomTabBar";
import { withScreenBoundary } from "../components/common/ScreenErrorFallback";
import HomeScreen from "../screens/HomeScreen";
import { ScreenNames } from "./ScreenNames";
import type { BottomTabParamList, AppStackNavigationProp } from "./types";
import { useNavigation } from "@react-navigation/native";
import { useAuthState } from "../context/AuthContext";
import { DrawerProvider, useDrawer } from "../context/DrawerContext";
import { TabBarHideProvider } from "../context/TabBarHideContext";

const Tab = createBottomTabNavigator<BottomTabParamList>();

function BottomTabNavigator() {
  const navigation = useNavigation<AppStackNavigationProp<typeof ScreenNames.Root>>();
  const { isSignedIn, needsUsername } = useAuthState();
  const isAuthed = isSignedIn && !needsUsername;

  const { drawerOpen, closeDrawer } = useDrawer();

  const renderTabBar = useCallback(
    (props: any) => <FloatingBottomTabBar {...props} />,
    [],
  );

  return (
    <View style={styles.root}>
      <Tab.Navigator
        tabBar={renderTabBar}
        screenLayout={withScreenBoundary}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          freezeOnBlur: true,
          lazy: true,
        }}
      >
        {/* Home is the initial route, so it is imported statically — deferring
            it would only add a hop. Every other tab is attached with
            getComponent so its module (and its import graph) is evaluated on
            first navigation rather than at boot. `lazy: true` above only delays
            *rendering*; the modules were still parsed either way.

            The Upload tab never actually renders — its tabPress listener
            preventDefaults and pushes the modal Upload route instead — so
            without this the largest screen in the app was parsed on boot to
            display nothing. */}
        <Tab.Screen name={ScreenNames.Home} component={HomeScreen} />
        <Tab.Screen
          name={ScreenNames.DM}
          getComponent={() => require("../screens/DirectMessagesScreen").default}
        />
        <Tab.Screen
          name={ScreenNames.UploadTab}
          getComponent={() => require("../screens/UploadScreen").default}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              if (!isAuthed) {
                navigation.navigate(ScreenNames.SignIn);
                return;
              }
              navigation.navigate(ScreenNames.Upload);
            },
          }}
        />
        <Tab.Screen
          name={ScreenNames.AIChat}
          getComponent={() => require("../screens/AIChatScreen").default}
        />
        <Tab.Screen
          name={ScreenNames.Explore}
          getComponent={() => require("../screens/SearchScreen").default}
        />
      </Tab.Navigator>
      <AppDrawer visible={drawerOpen} onClose={closeDrawer} />
    </View>
  );
}

function BottomTabNavigatorWithDrawer() {
  return (
    <TabBarHideProvider>
      <DrawerProvider>
        <BottomTabNavigator />
      </DrawerProvider>
    </TabBarHideProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default BottomTabNavigatorWithDrawer;
