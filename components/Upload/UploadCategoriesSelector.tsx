import React, { useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type UploadCategoriesSelectorProps = {
  categories: string[];
  allCategories: string[];
  categoryQuery: string;
  setCategoryQuery: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  min: number;
  max: number;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  type?: 'feed' | 'video' | 'live';
  /** Hide the selected-category pills inside the selector */
  hidePills?: boolean;
  /** Hide the header row (title + count) */
  hideHeader?: boolean;
  /** Custom placeholder for the search input */
  placeholder?: string;
};

const UploadCategoriesSelector: React.FC<UploadCategoriesSelectorProps> = ({
  categories,
  allCategories,
  categoryQuery,
  setCategoryQuery,
  open,
  setOpen,
  min,
  max,
  onAdd,
  onRemove,
  type,
  hidePills,
  hideHeader,
  placeholder: placeholderProp,
}) => {
  const filtered = useMemo(() => {
    const list = categoryQuery
      ? allCategories.filter((c) =>
          c.toLowerCase().includes(categoryQuery.toLowerCase())
        )
      : allCategories;
    return list.slice(0, 8);
  }, [allCategories, categoryQuery]);

  return (
    <View className="mb-4">
      {!hideHeader && (
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-gray-400">
            Categories {type !== 'feed' && <Text className="text-red-500">*</Text>}
          </Text>
          <Text
            className={`text-xs ${
              categories.length >= max ? "text-red-500" : "text-gray-500"
            }`}
          >
            {categories.length}/{max}
          </Text>
        </View>
      )}
      {!hidePills && categories.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mb-2">
          {categories.map((c) => (
            <View
              key={c}
              className="flex-row items-center px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800"
            >
              <Text className="text-white text-xs">{c}</Text>
              <TouchableOpacity
                disabled={categories.length <= min}
                onPress={() => onRemove(c)}
                className="ml-1"
              >
                <Ionicons
                  name="close-circle"
                  size={14}
                  color={categories.length <= min ? "#52525B" : "#9CA3AF"}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
      {categories.length < max ? (
        <View>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setOpen(true)}
            className="h-12 px-3 rounded-xl bg-zinc-900 border border-zinc-800 justify-center"
          >
            <TextInput
              value={categoryQuery}
              onChangeText={(t) => {
                setCategoryQuery(t);
                setOpen(true);
              }}
              onSubmitEditing={() => onAdd(categoryQuery)}
              returnKeyType="done"
              placeholder={
                placeholderProp
                  ? placeholderProp
                  : categories.length
                    ? "Add more categories"
                    : "Search or type a category"
              }
              placeholderTextColor="#9CA3AF"
              className="text-white"
            />
          </TouchableOpacity>
          {open && (
            <View className="mt-1 rounded-xl bg-zinc-900 border border-zinc-800">
              {filtered.length === 0 ? (
                <TouchableOpacity onPress={() => onAdd(categoryQuery)} className="px-3 py-3">
                  <Text className="text-white">Create “{categoryQuery.trim() || "…"}”</Text>
                </TouchableOpacity>
              ) : (
                filtered.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => onAdd(opt)}
                    className="px-3 py-3 border-b border-zinc-800 last:border-b-0"
                  >
                    <Text className="text-white">{opt}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      ) : (
        <Text className="mt-1 text-xs text-gray-500">
          Maximum of {max} categories selected.
        </Text>
      )}
    </View>
  );
};

export default UploadCategoriesSelector;
