import React from "react";
import { View, Text, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistance } from "date-fns";

interface VideoCardProps {
  title: string;
  views: number;
  duration?: string;
  creator: string;
  thumbnail: string;
  createdAt: string;
  likes: number;
  isLive?: boolean;
  isPayPerView?: boolean;
  payPerViewAmount?: number;
  payPerViewTokenSymbol?: string;
  isLocked?: boolean;
  lockContentAmount?: number;
  lockContentTokenSymbol?: string;
  profilePicture: string;
  badgeIcon: string;
}

const VideoCard: React.FC<VideoCardProps> = ({
  title,
  views,
  duration,
  creator,
  thumbnail,
  createdAt,
  likes,
  isLive,
  isPayPerView,
  payPerViewAmount,
  payPerViewTokenSymbol,
  isLocked,
  lockContentAmount,
  lockContentTokenSymbol,
  profilePicture,
  badgeIcon,
}) => (
  <View className="bg-theme-neutrals-800 rounded-lg my-2 overflow-hidden">
    <View className="relative w-full h-48 bg-theme-neutrals-700 justify-center items-center">
      <Image
        source={{ uri: thumbnail }}
        className="absolute inset-0 w-full h-full"
        resizeMode="cover"
      />
      {isLive && (
        <View className="absolute top-2 left-2 bg-red-600 px-2 py-1 rounded">
          <Text className="text-theme-neutrals-200 text-xs font-bold">LIVE</Text>
        </View>
      )}
      {isPayPerView && (
        <View className="absolute top-2 right-2 bg-blue-600 px-2 py-1 rounded">
          <Text className="text-theme-neutrals-200 text-xs font-bold">
            PPV: {payPerViewAmount} {payPerViewTokenSymbol}
          </Text>
        </View>
      )}
      {isLocked && (
        <View className="absolute bottom-2 right-2 bg-purple-600 px-2 py-1 rounded">
          <Text className="text-theme-neutrals-200 text-xs font-bold">
            Lock: {lockContentAmount} {lockContentTokenSymbol}
          </Text>
        </View>
      )}
      {duration && (
        <View className="absolute bottom-2 left-2 bg-black/60 rounded px-1.5 py-0.5">
          <Text className="text-theme-neutrals-200 text-xs">{duration}</Text>
        </View>
      )}
    </View>
    <View className="p-3">
      <View className="flex-row items-center mb-1">
        <Image
          source={{ uri: profilePicture }}
          className="w-8 h-8 rounded-full mr-2"
        />
        <View className="flex flex-col">
          <Text className="text-base font-bold text-theme-neutrals-100 mr-2">
            {title}
          </Text>
          <View className="flex-1 flex-row items-center gap-1">
            <Text className="text-[10px] text-theme-neutrals-300">
              {creator}
            </Text>
            <Ionicons name={badgeIcon as any} size={10} color="gold" />
          </View>
        </View>
      </View>
      <View className="flex-row justify-between items-center mt-2">
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-theme-neutrals-300">{views} views</Text>
          <Ionicons name="ellipse" size={4} color="#A3A3A3" style={{ marginHorizontal: 4 }} />
          <Text className="text-xs text-theme-neutrals-300">
            {formatDistance(new Date(createdAt), new Date(), {
              addSuffix: true,
            })}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Ionicons name="heart" size={16} color="red" />
          <Text className="text-sm text-theme-neutrals-300">{likes}</Text>
        </View>
      </View>
    </View>
  </View>
);

export default VideoCard;
