import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";

interface MenuItem {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

const ProfileMenu: React.FC = () => {
  const navigation = useNavigation<any>();

  const goVideos = useCallback(
    () => navigation.navigate(ScreenNames.YourVideos),
    [navigation]
  );
  const goLiked = useCallback(
    () => navigation.navigate(ScreenNames.LikedVideos),
    [navigation]
  );
  const goSaved = useCallback(
    () => navigation.navigate(ScreenNames.SavedPosts),
    [navigation]
  );
  const goSettings = useCallback(
    () => navigation.navigate(ScreenNames.AccountSettings),
    [navigation]
  );

  const items: MenuItem[] = [
    {
      key: "posts",
      title: "Your Posts",
      icon: "grid",
      onPress: goVideos,
    },
    {
      key: "liked-posts",
      title: "Liked Posts",
      icon: "heart",
      onPress: goLiked,
    },
    {
      key: "saved-posts",
      title: "Saved Posts",
      icon: "bookmark",
      onPress: goSaved,
    },
    {
      key: "settings",
      title: "Settings",
      icon: "settings",
      onPress: goSettings,
    },
  ];

  return (
    <View className="mt-6 mb-10 mx-4 bg-theme-neutrals-800 rounded-xl overflow-hidden border">
      {items.map((item, idx) => (
        <TouchableOpacity
          key={item.key}
          onPress={item.onPress}
          activeOpacity={0.7}
          className={`flex-row items-center px-4 py-4 ${
            idx < items.length - 1 ? "border-b border-theme-neutrals-700" : ""
          }`}
        >
          <Ionicons name={item.icon} size={22} color="white" />
          <Text className="ml-3 text-white text-base font-medium">
            {item.title}
          </Text>
          <View className="flex-1" />
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default ProfileMenu;
