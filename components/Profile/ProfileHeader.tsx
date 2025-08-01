import React from "react";
import {
  View,
  Text,
  ImageBackground,
  Image,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { copyToClipboard } from "../../libs";
import profileImage from "../../assets/favicon.png";
import bannerImage from "../../assets/banner.png";
import { theme } from "../../theme";

const ProfileHeader = () => {
  return (
    <View className="w-full">
      <ImageBackground
        source={bannerImage}
        style={{ height: 100 }}
        className="w-full bg-cover bg-center"
        imageStyle={{ borderRadius: 4 }}
        resizeMode="contain"
      >
        <View className="relative px-4 py-6 w-full h-full">
          <TouchableOpacity className="absolute top-2 right-2 bg-theme-neutrals-900 p-2 rounded-lg border border-theme-neutrals-200">
            <Ionicons
              name="share-social"
              size={20}
              color={theme.colors.accentForeground}
            />
          </TouchableOpacity>
        </View>
      </ImageBackground>
      <View className="flex-row items-end mt-[-36px] px-4">
        <Image
          source={profileImage}
          className="w-24 h-24 rounded-full border-[8px] border-theme-neutrals-900"
        />

        <TouchableOpacity className="ml-auto bg-gray-600 px-4 py-2 rounded-full">
          <Text className="text-white text-sm">Edit Profile</Text>
        </TouchableOpacity>
      </View>
      <View className="flex-row px-6 mt-2 gap-4">
        <Text className="text-white text-3xl font-bold">alhaji</Text>
        <TouchableOpacity onPress={() => copyToClipboard("0x1234...abcd")}>
          <View className="flex-row items-center mt-1">
            <Text className="text-gray-400 text-sm mr-2">0x1234...abcd</Text>
            <Ionicons name="copy-outline" size={16} color="#9ca3af" />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ProfileHeader;
