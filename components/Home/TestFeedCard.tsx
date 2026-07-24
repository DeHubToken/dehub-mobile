/**
 * TestFeedCard - Test component to demonstrate feed items in the home screen
 * 
 * This shows how image and text feed posts will look mixed with video content.
 * Remove this component after testing.
 */
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "../common/Avatar";
import { theme } from "../../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_WIDTH = SCREEN_WIDTH - 32; // Account for parent padding

type TestFeedCardType = "image" | "text" | "multi-image";

interface TestFeedCardProps {
  type?: TestFeedCardType;
  onPress?: () => void;
}

// Test data for different feed types
const TEST_DATA = {
  image: {
    username: "cryptoartist",
    displayName: "Crypto Artist",
    avatarUrl: "https://i.pravatar.cc/150?img=1",
    content: "Just minted my latest NFT collection! 🎨 What do you think?",
    images: ["https://picsum.photos/seed/feed1/800/600"],
    likes: 128,
    comments: 24,
    timeAgo: "2h ago",
  },
  text: {
    username: "web3builder",
    displayName: "Web3 Builder",
    avatarUrl: "https://i.pravatar.cc/150?img=2",
    content:
      "Just deployed a new smart contract on Base! The gas fees are incredibly low compared to mainnet. Really excited about what we're building. The future of decentralized social media is here! 🚀\n\nWhat chains are you all building on?",
    images: [],
    likes: 89,
    comments: 42,
    timeAgo: "4h ago",
  },
  "multi-image": {
    username: "nftcollector",
    displayName: "NFT Collector",
    avatarUrl: "https://i.pravatar.cc/150?img=3",
    content: "My latest pickups from the DeHub marketplace 🔥",
    images: [
      "https://picsum.photos/seed/multi1/400/400",
      "https://picsum.photos/seed/multi2/400/400",
      "https://picsum.photos/seed/multi3/400/400",
      "https://picsum.photos/seed/multi4/400/400",
    ],
    likes: 256,
    comments: 67,
    timeAgo: "6h ago",
  },
};

const TestFeedCardComponent: React.FC<TestFeedCardProps> = ({
  type = "image",
  onPress,
}) => {
  const data = TEST_DATA[type];
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    if (index !== activeImageIndex && index >= 0 && index < data.images.length) {
      setActiveImageIndex(index);
    }
  };

  const renderImages = () => {
    if (data.images.length === 0) return null;

    if (data.images.length === 1) {
      return (
        <TouchableOpacity activeOpacity={0.9} className="mt-3">
          <Image
            source={{ uri: data.images[0] }}
            className="w-full rounded-xl"
            style={{ height: IMAGE_WIDTH }} // Square aspect ratio
            resizeMode="cover"
          />
        </TouchableOpacity>
      );
    }

    // Instagram-style swipeable carousel
    return (
      <View className="mt-3">
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={IMAGE_WIDTH}
          snapToAlignment="start"
          contentContainerStyle={{ gap: 0 }}
        >
          {data.images.map((uri, index) => (
            <TouchableOpacity
              key={index}
              activeOpacity={0.95}
              style={{ width: IMAGE_WIDTH }}
            >
              <Image
                source={{ uri }}
                className="rounded-xl"
                style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Image counter badge (top right) */}
        <View className="absolute top-3 right-3 bg-black/60 rounded-full px-2.5 py-1">
          <Text className="text-white text-xs font-medium">
            {activeImageIndex + 1}/{data.images.length}
          </Text>
        </View>

        {/* Dot indicators (bottom center) */}
        <View className="absolute bottom-3 left-0 right-0 flex-row justify-center items-center gap-1.5">
          {data.images.map((_, index) => (
            <View
              key={index}
              className={`rounded-full ${
                index === activeImageIndex
                  ? "bg-white w-2 h-2"
                  : "bg-white/50 w-1.5 h-1.5"
              }`}
            />
          ))}
        </View>

        {/* Navigation arrows (optional - shows on edges) */}
        {activeImageIndex > 0 && (
          <View className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 rounded-full p-1">
            <Ionicons name="chevron-back" size={20} color="white" />
          </View>
        )}
        {activeImageIndex < data.images.length - 1 && (
          <View className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 rounded-full p-1">
            <Ionicons name="chevron-forward" size={20} color="white" />
          </View>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      className="my-4"
    >
      {/* Header - matches VideoCard style */}
      <View className="flex-row items-start pb-3">
        <View className="flex-row flex-1 min-w-0">
          <TouchableOpacity activeOpacity={0.7}>
            <Avatar uri={data.avatarUrl} size={32} className="mr-2" />
          </TouchableOpacity>
          <View className="flex-1 min-w-0">
            <Text
              className="text-base font-bold text-theme-neutrals-100 mr-2"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {data.displayName}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text
                className="text-[10px] text-theme-neutrals-300"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {data.username}
              </Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Image
                  source={require("../../assets/badges/dark/user.png")}
                  className="w-3 h-3"
                />
              </TouchableOpacity>
              <Text className="text-[10px] text-theme-neutrals-400">
                · {data.timeAgo}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity className="p-1">
          <Ionicons name="ellipsis-horizontal" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View>
        <Text
          className="text-theme-neutrals-100 text-sm leading-5"
          numberOfLines={type === "text" ? undefined : 3}
        >
          {data.content}
        </Text>
        {renderImages()}
      </View>

      {/* Actions */}
      <View className="flex-row items-center justify-between py-3">
        <View className="flex-row items-center gap-6">
          {/* Like */}
          <TouchableOpacity className="flex-row items-center">
            <Ionicons name="heart-outline" size={22} color="#9CA3AF" />
            <Text className="text-theme-neutrals-400 text-sm ml-1.5">
              {data.likes}
            </Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity className="flex-row items-center">
            <Ionicons name="chatbubble-outline" size={20} color="#9CA3AF" />
            <Text className="text-theme-neutrals-400 text-sm ml-1.5">
              {data.comments}
            </Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity className="flex-row items-center">
            <Ionicons name="share-outline" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Bookmark */}
        <TouchableOpacity>
          <Ionicons name="bookmark-outline" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export const TestFeedCard = React.memo(TestFeedCardComponent);
export default TestFeedCard;
