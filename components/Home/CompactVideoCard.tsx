import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface CompactVideoCardProps {
  title: string;
  views: number;
  createdAt: string;
  thumbnail: string;
  likes: number;
}

const CompactVideoCard: React.FC<CompactVideoCardProps> = ({
  title,
  views,
  createdAt,
  thumbnail,
  likes,
}) => (
    <View className="m-1 px-4 py-2">
      <TouchableOpacity className="bg-theme-neutrals-900 rounded-lg overflow-hidden flex-row items-center p-2 border border-theme-neutrals-700">
        <Image
          source={{ uri: thumbnail }}
          className="w-20 h-20 rounded-md"
          resizeMode="cover"
        />
        <View className="flex-1 ml-3">
          <Text className="text-theme-neutrals-100 text-sm font-bold">
            {title}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text className="text-theme-neutrals-300 text-xs">{views} views</Text>
            <Ionicons
              name="ellipse"
              size={4}
              color="#A3A3A3"
              style={{ marginHorizontal: 4 }}
            />
            <Text className="text-theme-neutrals-300 text-xs">{createdAt}</Text>
          </View>
          <View className="flex-row items-center mt-1">
            <Ionicons name="heart" size={12} color="red" />
            <Text className="text-theme-neutrals-300 text-xs ml-1">{likes}</Text>
          </View>
        </View>
        <Ionicons
          name="ellipsis-horizontal"
          size={20}
          color="white"
          className="ml-2"
        />
      </TouchableOpacity>
    </View>
);

export default CompactVideoCard;
