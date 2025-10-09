import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import SmartImage from "./common/SmartImage";
import * as Application from "expo-application";
import { Ionicons } from "@expo/vector-icons";
// import AntDesign from '@expo/vector-icons/AntDesign';
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useAuth } from "../context/AuthContext";
import { toastError, toastInfo, toastSuccess } from "../libs";

const HomeHeader = () => {
  const navigation = useNavigation<any>();
  const { isSignedIn, user } = useAuth();
  const notifCount = user?.notificationCount || 0;
  const displayCount =
    notifCount > 4 ? "4+" : notifCount > 0 ? String(notifCount) : "";

  return (
    <View className="flex-row justify-between items-center p-4">
      <View className="flex-row items-center">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            const ver = Application.nativeApplicationVersion || "0.0.0";
            const build = Application.nativeBuildVersion
              ? ` (${Application.nativeBuildVersion})`
              : "";
            toastInfo(`DHB v${ver}${build}`);
          }}
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
              {displayCount !== "" && (
                <View className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1.5 bg-theme-accent rounded-full items-center justify-center">
                  <Text className="text-white text-[9px] font-semibold leading-none">
                    {displayCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          className="p-1 ml-4"
          onPress={() => navigation.navigate(ScreenNames.Search)}
          // onPress={() => toastError("Hello, World!")}
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
