import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  TextInput,
  FlatList,
  Text,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
// Video card logic moved into SearchMediaList component.
import {
  fetchSuggestions,
  performSearch,
  getHistory,
  addToHistory,
  topHistorySubset,
} from "../services/search.service";
import SearchSkeleton from "../components/Search/SearchSkeleton";
import SearchResultsTabs from "../components/Search/SearchResultsTabs";
import type { FC } from "react";

// Removed dummy results; real search now uses backend endpoints.
const SearchScreen: FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [livestreams, setLivestreams] = useState<any[]>([]);
  const [pageAccounts, setPageAccounts] = useState(0);
  const [pageVideos, setPageVideos] = useState(0);
  const [pageLivestreams, setPageLivestreams] = useState(0);
  const PAGE_SIZE = 20;
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const navigation = useNavigation();

  const loadHistory = useCallback(async () => {
    const h = await getHistory();
    setSearchHistory(h);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const executeSearch = useCallback(
    async (term: string) => {
      const q = term.trim();
      if (!q) return;
      setLoading(true);
      setHasSearched(true);
      const res = await performSearch(q, { unit: PAGE_SIZE, page: 0 });
      setAccounts(res.result.accounts);
      setVideos(res.result.videos);
      setLivestreams(res.result.livestreams);
      setPageAccounts(res.result.accounts.length ? 1 : 0);
      setPageVideos(res.result.videos.length ? 1 : 0);
      setPageLivestreams(res.result.livestreams.length ? 1 : 0);
      await addToHistory(q);
      loadHistory();
      setSuggestions([]);
      setLoading(false);
    },
    [loadHistory]
  );

  const handleSearch = useCallback(() => {
    executeSearch(searchQuery);
  }, [executeSearch, searchQuery]);
  const handleSuggestionClick = (s: string) => {
    setSearchQuery(s);
    executeSearch(s);
  };
  const handleReplaceSearchBox = (s: string) => {
    setSearchQuery(s);
  };
  const clearSearch = () => {
    setSearchQuery("");
    setAccounts([]);
    setVideos([]);
    setLivestreams([]);
    setSuggestions([]);
    setHasSearched(false);
    setPageAccounts(0);
    setPageVideos(0);
    setPageLivestreams(0);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const q = searchQuery.trim();
      if (!q) {
        setSuggestions([]);
        setAccounts([]);
        setVideos([]);
        setLivestreams([]);
        return;
      }
      const sugg = await fetchSuggestions(q);
      if (!cancelled) setSuggestions(sugg.slice(0, 3));
    };
    if (searchQuery) run();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  // Determine what content to show
  const getContentToRender = () => {
    // Case: search executed
    if (loading) {
      return <SearchSkeleton />;
    }
    if (hasSearched) {
      const total = accounts.length + videos.length + livestreams.length;
      if (total === 0) {
        return (
          <View className="flex-1 items-center mt-20 px-6">
            <Text className="text-theme-neutrals-300 font-semibold text-sm mb-2">
              No results found
            </Text>
            <Text className="text-theme-neutrals-500 text-xs text-center">
              Try refining your search terms or check your spelling.
            </Text>
          </View>
        );
      }
      return (
        <SearchResultsTabs
          query={searchQuery}
          accounts={accounts}
          videos={videos}
          livestreams={livestreams}
          pageAccounts={pageAccounts}
          pageVideos={pageVideos}
          pageLivestreams={pageLivestreams}
          setAccounts={setAccounts}
          setVideos={setVideos}
          setLivestreams={setLivestreams}
          setPageAccounts={setPageAccounts}
          setPageVideos={setPageVideos}
          setPageLivestreams={setPageLivestreams}
        />
      );
    }
    // Not searched yet: show suggestions (if typing) or history
    const typing = !!searchQuery.trim();
    if (typing) {
      if (suggestions.length === 0) return null; // show nothing while typing with no suggestions
      return (
        <FlatList
          data={suggestions}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
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
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color="white"
                  style={{ transform: [{ rotate: '45deg' }] }}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      );
    }
    // History view
    const historySubset = topHistorySubset(searchHistory, 6);
    if (historySubset.length === 0) {
      return (
        <View className="mt-10 px-6">
          <Text className="text-theme-neutrals-400 text-xs text-center">
            No search history yet.
          </Text>
          <Text className="text-theme-neutrals-600 text-xs text-center mt-2">
            Try searching for creators, videos, or tokens.
          </Text>
        </View>
      );
    }
    return (
      <FlatList
        data={historySubset}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
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
        )}
      />
    );
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
          autoFocus
          returnKeyType="search"
        />
        <TouchableOpacity
          className="p-2 ml-2"
          onPress={searchQuery.trim() ? clearSearch : handleSearch}
        >
          <Ionicons
            name={
              searchQuery.trim() ? "close" : loading ? "hourglass" : "search"
            }
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
