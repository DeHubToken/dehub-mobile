import React, { useMemo, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, TextInput, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "./GlassModal";
import { colors } from "../../theme/colors";

export type DropdownOption = { label: string; value: string; disabled?: boolean };

type Props = {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
};

const Dropdown: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = "Select",
  searchable = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const choose = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  return (
    <>
      <TouchableOpacity
        disabled={disabled}
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        className={`h-11 px-3 rounded-lg bg-theme-neutrals-800 border border-theme-neutrals-700 flex-row items-center justify-between ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <Text className={selected ? "text-white" : "text-theme-neutrals-400"}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.neutrals[400]} />
      </TouchableOpacity>

      <GlassModal visible={open} onClose={() => setOpen(false)} presentation="bottom" maxHeight="70%">
        <View className="p-3">
          {searchable && (
            <View className="mb-2">
              <View className="h-11 px-3 rounded-lg bg-theme-neutrals-800 border border-theme-neutrals-700 flex-row items-center">
                <Ionicons name="search" size={16} color={colors.neutrals[400]} />
                <TextInput
                  className="flex-1 ml-2 text-white"
                  placeholder="Search"
                  placeholderTextColor={colors.neutrals[500]}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                />
              </View>
            </View>
          )}

          {filtered.length === 0 ? (
            <View className="py-8 items-center">
              <Text className="text-theme-neutrals-400">No results</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  disabled={!!item.disabled}
                  onPress={() => {
                    if (item.disabled) return;
                    choose(item.value);
                  }}
                  className={`px-3 py-3 border-b border-theme-neutrals-700 flex-row items-center justify-between ${
                    item.disabled ? "opacity-50" : ""
                  }`}
                >
                  <Text className={item.disabled ? "text-theme-neutrals-500" : "text-white"}>
                    {item.label}
                  </Text>
                  {item.value === value ? (
                    <Ionicons name="checkmark" size={16} color="#F4F4F5" />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </GlassModal>
    </>
  );
};

export default Dropdown;
