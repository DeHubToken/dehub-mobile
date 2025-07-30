import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import CompactVideoCard from "../components/Home/CompactVideoCard";

const dummyResults = [
  {
    title: "Video title 1",
    views: 12000,
    createdAt: "4 Feb, 2025",
    thumbnail: "https://example.com/thumbnail1.jpg",
    likes: 100,
  },
  {
    title: "Video title 2",
    views: 8500,
    createdAt: "3 Feb, 2025",
    thumbnail: "https://example.com/thumbnail2.jpg",
    likes: 85,
  },
  {
    title: "Video title 3",
    views: 2400,
    createdAt: "2 Feb, 2025",
    thumbnail: "https://example.com/thumbnail3.jpg",
    likes: 45,
  },
];
const SearchScreen = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<any[]>([]); // Replace with actual result type
  const [searchHistory, setSearchHistory] = useState<string[]>([
    "History 1",
    "History 2",
    "History 3",
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const navigation = useNavigation();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Simulate search logic with video data
      setResults(dummyResults);
      setSearchHistory((prev) => [
        searchQuery,
        ...prev.filter((item) => item !== searchQuery),
      ]);
      setSuggestions([]); // Clear suggestions when showing results
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchQuery(suggestion);
    setResults(dummyResults);
    // Trigger search with the selected suggestion
    setTimeout(() => handleSearch(), 0);
  };

  const handleReplaceSearchBox = (suggestion: string) => {
    setSearchQuery(suggestion);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setResults([]);
    setSuggestions([]);
  };

  useEffect(() => {
    if (searchQuery.trim() && results.length === 0) {
      // Simulate fetching suggestions only when there are no results yet
      setSuggestions(["Suggestion 1", "Suggestion 2", "Suggestion 3"]);
    } else if (!searchQuery.trim()) {
      setSuggestions([]);
      setResults([]);
    }
  }, [searchQuery]);

  // Determine what content to show
  const getContentToRender = () => {
    if (results.length > 0) {
      // Show search results using CompactVideoCard
      return (
        <FlatList
          data={results}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <CompactVideoCard
              title={item.title}
              views={item.views}
              createdAt={item.createdAt}
              thumbnail={item.thumbnail}
              likes={item.likes}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      );
    } else {
      // Show suggestions or search history
      return (
        <FlatList
          data={searchQuery.trim() ? suggestions : searchHistory}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) =>
            searchQuery.trim() ? (
              <TouchableOpacity
                className="p-4 border-b border-theme-neutrals-800 flex-row items-center"
                onPress={() => handleSuggestionClick(item)}
              >
                <Ionicons
                  name="search-outline"
                  size={20}
                  color="white"
                  className="mr-4"
                />
                <Text className="text-white flex-1">{item}</Text>
                <TouchableOpacity
                  className="p-2"
                  onPress={() => handleReplaceSearchBox(item)}
                >
                  <Ionicons name="arrow-forward" size={20} color="white" />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="p-4 border-b border-theme-neutrals-800 flex-row items-center"
                onPress={() => handleSuggestionClick(item)}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color="white"
                  className="mr-4"
                />
                <Text className="text-white flex-1">{item}</Text>
              </TouchableOpacity>
            )
          }
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center mt-20">
              <Text className="text-theme-neutrals-400">No results found</Text>
            </View>
          }
        />
      );
    }
  };

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <View className="flex-row items-center p-4 border-b border-theme-neutrals-700">
        <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <TextInput
          className="flex-1 bg-theme-neutrals-800 text-white px-4 py-2 rounded-md ml-2"
          placeholder="Search Dehub"
          placeholderTextColor="gray"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          autoFocus={true}
          returnKeyType="search"
        />
        <TouchableOpacity
          className="p-2 ml-2"
          onPress={searchQuery.trim() ? clearSearch : handleSearch}
        >
          <Ionicons
            name={searchQuery.trim() ? "close" : "search"}
            size={24}
            color="white"
          />
        </TouchableOpacity>
      </View>
      {getContentToRender()}
    </View>
  );
};

export default SearchScreen;
