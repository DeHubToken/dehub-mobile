import React from "react";
import {
  View,
  Text,
  ImageBackground,
  Image,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import profileImage from "../../assets/favicon.png";
import bannerImage from "../../assets/banner.png";
import { theme } from "../../theme";

const ProfileHeader = () => {
  return (
    <View className="w-full">
      <ImageBackground
        source={bannerImage}
        className="w-full bg-cover bg-center"
        style={{ height: 100 }}
      >
        <View className="relative px-4 py-6 w-full h-full">
          <TouchableOpacity className="absolute top-2 right-2 bg-theme-neutrals-200 p-2 rounded-lg">
            <Ionicons name="share-social" size={24} color={theme.colors.accent}/>
          </TouchableOpacity>
        </View>
      </ImageBackground>
      <View className="flex-row items-start mt-[-10px]">
        <Image
          source={profileImage}
          className="w-20 h-20 rounded-full border-4 border-gray-800"
        />
        <View className="ml-4">
          <Text className="text-white text-xl font-bold">alhaji</Text>
          <Text className="text-gray-400 text-sm">An0nym0usAng3l</Text>
        </View>
        <TouchableOpacity className="ml-auto bg-blue-600 px-4 py-2 rounded-full">
          <Text className="text-white text-sm">Edit Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ProfileHeader;
