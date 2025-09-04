import React from "react";
import { View, TouchableOpacity, Image, Text } from "react-native";
import { Ionicons, AntDesign } from "@expo/vector-icons";
// import AntDesign from '@expo/vector-icons/AntDesign';
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { useAuth } from "../context/AuthContext";
import { toastError, toastInfo, toastSuccess } from "../libs";

const HomeHeader = () => {
  const navigation = useNavigation<any>();
  const { isSignedIn } = useAuth();

  return (
    <View className="flex-row justify-between items-center p-4 border-b border-theme-neutrals-700">
      <View className="flex-row items-center">
        <Image
          source={require("../assets/banner.png")}
          className="w-32 h-11 mx-2"
          resizeMode="contain"
        />
      </View>
      <View className="flex-row items-center">
        <TouchableOpacity
          className="p-1"
          onPress={() => navigation.navigate(ScreenNames.Leaderboard)}
        >
          <Ionicons name="trophy-outline" size={24} color="white" />
        </TouchableOpacity>
        {isSignedIn ? (
          <TouchableOpacity
          className="p-1 ml-4"
            onPress={() => navigation.navigate(ScreenNames.Notifications)}
          >
            <Ionicons name="notifications-outline" size={24} color="white" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          className="p-1 ml-4"
          onPress={() => navigation.navigate(ScreenNames.Search)}
          // onPress={() => toastError("Hello, World!")}
        >
          <Ionicons name="search" size={24} color="white" />
        </TouchableOpacity>
        {!isSignedIn && (
          <TouchableOpacity
            className="p-1 ml-4"
            onPress={() => navigation.navigate(ScreenNames.SignIn)}
          >
            <Ionicons name="person-circle-outline" size={24} color="white" />
            {/* <AntDesign name="login" size={24} color="white" /> */}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default HomeHeader;
