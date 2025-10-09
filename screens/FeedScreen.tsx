import React, { memo, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import HomeHeader from "../components/HomeHeader";
import { theme } from "../theme";
import CategorySelector from "../components/Home/CategorySelector";

const feedTabs = ["All","For You", "Subscribed", "Followed", "Liked", "Saved"];

type FeedPost = {
  id: number;
  user: string;
  time: string;
  content: string;
  images: number[]; // require(...) resolves to number in RN
  likes: number;
  comments: number;
  category: string;
};

const feedData: FeedPost[] = [
  {
    id: 1,
    user: "jules",
    time: "2 months ago",
    content: "ELON'S 'FREE SPEECH' RULE: AGREE WITH ME OR VANISH?!",
    images: [
      require("../assets/bike.jpg"),
      require("../assets/bike.jpg"),
      require("../assets/bike.jpg"),
    ],
    likes: 7,
    comments: 0,
    category: "For You",
  },
  {
    id: 2,
    user: "jules",
    time: "2 months ago",
    content:
      "Where's my coffee? 😜 Lazy Saturday and I couldn't be more happy!",
    images: [require("../assets/bike.jpg")],
    likes: 5,
    comments: 0,
    category: "Subscribed",
  },
  {
    id: 3,
    user: "emucoins",
    time: "3 months ago",
    content: "Motorcycle $DHB Motorcycle emu",
    images: [require("../assets/bike.jpg")],
    likes: 7,
    comments: 0,
    category: "For You",
  },
  {
    id: 4,
    user: "techguru",
    time: "1 week ago",
    content:
      "Just discovered this amazing new feature! Can't wait to share it with everyone.",
    images: [require("../assets/bike.jpg"), require("../assets/bike.jpg")],
    likes: 12,
    comments: 3,
    category: "Followed",
  },
  {
    id: 5,
    user: "cryptoexpert",
    time: "3 days ago",
    content: "The future of blockchain is here! #Web3 #Blockchain",
    images: [require("../assets/bike.jpg")],
    likes: 25,
    comments: 8,
    category: "Liked",
  },
];

type FeedItemProps = {
  item: FeedPost;
  onOpenImage: (images: number[], index: number) => void;
};

const FeedItem = memo(({ item, onOpenImage }: FeedItemProps) => {
  return (
    <View className="p-4 border-b border-theme-neutrals-700">
      <View className="flex-row items-center justify-between mb-2">
        <View>
          <Text className="text-theme-neutrals-200 text-sm font-bold">
            {item.user}
          </Text>
          <Text className="text-theme-neutrals-400 text-xs">{item.time}</Text>
        </View>
        <TouchableOpacity className="p-1">
          <Text className="text-theme-neutrals-400 text-lg">⋯</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-theme-neutrals-200 text-sm mt-2 leading-5">
        {item.content}
      </Text>

      {item.images && item.images.length > 0 && (
        <View className="flex-row flex-wrap mt-3">
          {item.images.map((image, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => onOpenImage(item.images, index)}
              className="mr-2 mb-2"
            >
              <Image source={image} className="w-24 h-24 rounded-md" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View className="flex-row justify-between items-center mt-3 pt-2 border-t border-theme-neutrals-800">
        <TouchableOpacity className="flex-row items-center">
          <Text className="text-theme-neutrals-400 text-xs">
            ❤️ {item.likes}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center">
          <Text className="text-theme-neutrals-400 text-xs">
            💬 {item.comments}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center">
          <Text className="text-theme-neutrals-400 text-xs">🔗</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-row items-center">
          <Text className="text-theme-neutrals-400 text-xs">📤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const FeedScreen = () => {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState("All");

  const filteredData = useMemo(() => {
    if (activeTab === "For You") return feedData;
    if (activeTab === "All") return feedData;
    return feedData.filter((item) => item.category === activeTab);
  }, [activeTab]);

  const handleOpenImage = useCallback(
    (images: number[], index: number) => {
      navigation.navigate(ScreenNames.ImageViewer, { images, index });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <FeedItem item={item} onOpenImage={handleOpenImage} />
    ),
    [handleOpenImage]
  );

  const keyExtractor = useCallback((item: FeedPost) => item.id.toString(), []);

  const renderEmptyState = useCallback(() => (
    <View className="flex-1 justify-center items-center p-8">
      <Text className="text-theme-neutrals-400 text-base text-center">
        No posts in {activeTab} yet
      </Text>
      <Text className="text-theme-neutrals-500 text-sm text-center mt-2">
        Check back later for new content
      </Text>
    </View>
  ), [activeTab]);

  

  return (
    <SafeAreaView className="flex-1 bg-theme-neutrals-900">
      <HomeHeader />
      <CategorySelector
        categories={feedTabs}
        selectedCategory={activeTab}
        onCategoryPress={(category) => setActiveTab(category)}
      />
      <FlatList
        data={filteredData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={80}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 16 }}
      />
    </SafeAreaView>
  );
};

export default FeedScreen;
