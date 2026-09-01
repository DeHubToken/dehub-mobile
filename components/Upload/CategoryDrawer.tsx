import React, { memo, useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface CategoryDrawerProps {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  allCategories: string[];
  min: number;
  max: number;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  type?: "feed" | "video" | "live";
}

const CategoryDrawer: React.FC<CategoryDrawerProps> = ({
  visible,
  onClose,
  categories,
  allCategories,
  min,
  max,
  onAdd,
  onRemove,
  type,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");

  const drawerHeight = Math.round(screenHeight * 0.65);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? allCategories.filter((c) => c.toLowerCase().includes(q))
      : allCategories;
    // Exclude already-selected
    return list.filter(
      (c) => !categories.some((sel) => sel.toLowerCase() === c.toLowerCase())
    );
  }, [allCategories, query, categories]);

  const handleAdd = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      if (categories.length >= max) return;
      onAdd(n);
      setQuery("");
    },
    [categories.length, max, onAdd]
  );

  const handleSubmit = useCallback(() => {
    if (query.trim()) handleAdd(query.trim());
  }, [query, handleAdd]);

  const atMax = categories.length >= max;

  const renderItem = useCallback(
    ({ item }: { item: string }) => {
      const isSelected = categories.some(
        (c) => c.toLowerCase() === item.toLowerCase()
      );
      return (
        <TouchableOpacity
          onPress={() => (isSelected ? onRemove(item) : handleAdd(item))}
          disabled={atMax && !isSelected}
          activeOpacity={0.7}
          className={`flex-row items-center justify-between px-4 py-3.5 border-b border-white/5 ${
            atMax && !isSelected ? "opacity-30" : ""
          }`}
        >
          <Text className="text-white text-[15px]">{cap(item)}</Text>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={20} color="#F4F4F5" />
          )}
        </TouchableOpacity>
      );
    },
    [categories, atMax, handleAdd, onRemove]
  );

  const keyExtractor = useCallback((item: string) => item, []);

  // Show "Create" option when query doesn't match any existing category
  const showCreate =
    query.trim().length > 0 &&
    !allCategories.some(
      (c) => c.toLowerCase() === query.trim().toLowerCase()
    ) &&
    !atMax;

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="70%"
      blurIntensity={40}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ height: drawerHeight }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={{ flex: 1 }}>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <Text className="text-white text-lg font-bold">Categories</Text>
            <View className="flex-row items-center">
              <Text
                className={`text-xs mr-3 ${
                  atMax ? "text-white/80" : "text-theme-neutrals-400"
                }`}
              >
                {categories.length}/{max}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={14}>
                <Ionicons name="close" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          {categories.length > 0 && (
            <View className="flex-row flex-wrap gap-2 px-4 pb-2">
              {categories.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => onRemove(c)}
                  disabled={categories.length <= min}
                  activeOpacity={0.7}
                  className="flex-row items-center px-2.5 py-1 rounded-full bg-theme-accent/15 border border-theme-accent/30"
                >
                  <Text className="text-theme-accent text-xs font-medium">
                    {cap(c)}
                  </Text>
                  {categories.length > min && (
                    <Ionicons
                      name="close"
                      size={12}
                      color="#F4F4F5"
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View className="mx-4 mb-2 flex-row items-center bg-white/5 border border-white/10 rounded-xl px-3" style={{ height: 44 }}>
            <Ionicons name="search" size={16} color="#6F7174" />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
              placeholder={atMax ? "Maximum reached" : "Search or create a category"}
              placeholderTextColor="#6F7174"
              editable={!atMax}
              className="flex-1 ml-2 text-white text-[14px]"
              style={{ paddingVertical: 0 }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={14}>
                <Ionicons name="close-circle" size={16} color="#6F7174" />
              </TouchableOpacity>
            )}
          </View>

          {showCreate && (
            <TouchableOpacity
              onPress={() => handleAdd(query.trim())}
              activeOpacity={0.7}
              className="flex-row items-center px-4 py-3 border-b border-white/5"
            >
              <Ionicons name="add-circle-outline" size={18} color="#F4F4F5" />
              <Text className="text-theme-accent text-[14px] ml-2 font-medium">
                Create "{cap(query.trim())}"
              </Text>
            </TouchableOpacity>
          )}

          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListEmptyComponent={
              !showCreate ? (
                <View className="items-center py-8">
                  <Text className="text-theme-neutrals-500 text-sm">
                    {query.trim()
                      ? "No matching categories"
                      : "No categories available"}
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      </KeyboardAvoidingView>
    </GlassModal>
  );
};

export default memo(CategoryDrawer);
