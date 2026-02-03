import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import SmartImage from "./common/SmartImage";
import * as Application from "expo-application";
import { Ionicons } from "@expo/vector-icons";
// import AntDesign from '@expo/vector-icons/AntDesign';
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useUser, useAuthState } from "../context/AuthContext";
import { theme } from "../theme";

const HomeHeader = () => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuthState();
  const user = useUser();
  // Show blue dot when there are unread notifications
  const hasUnread = (user?.notificationCount || 0) > 0;

  return (
    <View className="flex-row justify-between items-center p-4">
      <View className="flex-row items-center">
        <TouchableOpacity
          activeOpacity={1}
          // onPress={() => {
          //   const ver = Application.nativeApplicationVersion || "0.0.0";
          //   const build = Application.nativeBuildVersion
          //     ? ` (${Application.nativeBuildVersion})`
          //     : "";
          //   toastInfo(`DHB v${ver}${build}`);
          // }}
        >
          <SmartImage
            source={require("../assets/banner.png")}
            style={{ width: 128, height: 44, marginHorizontal: 8 }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={150}
          />
        </TouchableOpacity>
      </View>
      <View className="flex-row items-center">
        <TouchableOpacity
          className="p-1"
          onPress={() => navigation.navigate(ScreenNames.Leaderboard)}
        >
          <Ionicons name="trophy" size={24} color="#A6A9AC" />
        </TouchableOpacity>
        {isSignedIn ? (
          <TouchableOpacity
            className="p-1 ml-4"
            onPress={() => navigation.navigate(ScreenNames.Notifications)}
          >
            <View>
              <Ionicons name="notifications" size={24} color="#A6A9AC" />
              {hasUnread && (
                <View className="absolute -top-0.5 -right-1">
                  <Ionicons name="ellipse" size={10} color={theme.colors.accent} />
                </View>
              )}
            </View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          className="p-1 ml-4"
          onPress={() => navigation.navigate(ScreenNames.Search)}
        >
          <Ionicons name="search" size={24} color="#A6A9AC" />
        </TouchableOpacity>
        {!isSignedIn && (
          <TouchableOpacity
            className="p-1 ml-4"
            onPress={() => navigation.navigate(ScreenNames.SignIn)}
          >
            <Ionicons name="person-circle" size={24} color="#A6A9AC" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default HomeHeader;
