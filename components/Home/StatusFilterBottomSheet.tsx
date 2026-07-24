import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { statusOptions } from "../../libs";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import GlassModal from "../ui/GlassModal";

type StatusFilterBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  selectedSortMode: string;
  onSortModeChange: (mode: string) => void;
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
};

type RangeOption = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const rangeOptions: RangeOption[] = [
  { id: "all", label: "All", icon: "infinite-outline" },
  { id: "day", label: "Today", icon: "today-outline" },
  { id: "week", label: "This Week", icon: "calendar-outline" },
  { id: "month", label: "This Month", icon: "calendar-number-outline" },
  { id: "year", label: "This Year", icon: "time-outline" },
];

type StatusOption = {
  id: string;
  label: string;
  icon: string;
};

const ListSeparator: React.FC = () => <View className="h-2" />;

type OptionRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  size?: "md" | "sm";
  showCheck?: boolean;
  labelLines?: number;
  showIcon?: boolean;
};

const OptionRow: React.FC<OptionRowProps> = ({
  label,
  icon,
  selected,
  onPress,
  size = "md",
  showCheck = true,
  labelLines = 1,
  showIcon = true,
}) => {
  return (
    <TouchableOpacity
      className={`flex-row items-center rounded-xl border ${
        size === "sm" ? "py-4 px-2" : "py-3.5 px-2"
      } ${
        selected
          ? "bg-theme-accent/10 border-theme-accent"
          : "bg-black/15 border-theme-neutrals-800"
      }`}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {showIcon && (
        <View
          className={`items-center justify-center mr-2 ${
            size === "sm" ? "w-8 h-8" : "w-9 h-9"
          }`}
        >
          <Ionicons
            name={icon}
            size={size === "sm" ? 14 : 18}
            color={
              selected ? theme.colors.accent : theme.colors.mutedForeground
            }
          />
        </View>
      )}
      <Text
        className={`flex-1 ${size === "sm" ? "text-[12px]" : "text-[15px]"} ${
          selected
            ? "text-theme-neutrals-100 font-bold"
            : "text-theme-neutrals-400 font-semibold"
        }`}
        numberOfLines={labelLines}
      >
        {label}
      </Text>
      {showCheck && selected && (
        <Ionicons
          name="checkmark-circle"
          size={size === "sm" ? 16 : 20}
          color={theme.colors.accent}
        />
      )}
    </TouchableOpacity>
  );
};

const StatusFilterBottomSheet: React.FC<StatusFilterBottomSheetProps> = ({
  visible,
  onClose,
  selectedSortMode,
  onSortModeChange,
  selectedRange = "",
  onRangeChange,
}) => {
  const [localSortMode, setLocalSortMode] = useState(selectedSortMode);
  const [localRange, setLocalRange] = useState(selectedRange);

  const noop = useCallback(() => {}, []);

  useEffect(() => {
    if (visible) {
      setLocalSortMode(selectedSortMode);
      setLocalRange(selectedRange);
    }
  }, [visible, selectedSortMode, selectedRange]);

  const statusPressHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const option of statusOptions) {
      handlers[option.id] = () => setLocalSortMode(option.id);
    }
    return handlers;
  }, [setLocalSortMode, statusOptions]);

  const rangePressHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const option of rangeOptions) {
      handlers[option.id] = () => setLocalRange(option.id);
    }
    return handlers;
  }, [setLocalRange]);

  const renderStatusItem = useCallback(
    ({ item }: { item: StatusOption }) => {
      const onPress = statusPressHandlers[item.id] ?? noop;
      return (
        <OptionRow
          label={item.label}
          icon={item.icon as keyof typeof Ionicons.glyphMap}
          selected={localSortMode === item.id}
          onPress={onPress}
          // labelLines={2}
        />
      );
    },
    [localSortMode, noop, statusPressHandlers]
  );

  const renderRangeItem = useCallback(
    ({ item }: { item: RangeOption }) => {
      const isSelected =
        (localRange === "" && item.id === "all") || localRange === item.id;
      const onPress = rangePressHandlers[item.id] ?? noop;
      return (
        <OptionRow
          label={item.label.replace("This ", "")}
          icon={item.icon}
          selected={isSelected}
          onPress={onPress}
          size="sm"
          showCheck
          showIcon={false}
        />
      );
    },
    [localRange, noop, rangePressHandlers]
  );

  const handleApply = useCallback(() => {
    onSortModeChange(localSortMode);
    if (onRangeChange) {
      onRangeChange(localRange === "all" ? "" : localRange);
    }
    setTimeout(() => onClose(), 150);
  }, [localSortMode, localRange, onSortModeChange, onRangeChange, onClose]);

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="90%"
      blurIntensity={40}
    >
      <SafeAreaView edges={["bottom"]} className="max-h-[98%]">
        {/* Grabber */}
        <View className="items-center pt-2">
          <View className="w-10 h-1 rounded-full bg-white/15" />
        </View>

        {/* Header */}
        <View className="flex-row justify-between items-start px-5 pt-4 pb-4">
          <View className="flex-1 pr-3">
            <Text className="text-theme-neutrals-100 font-bold text-[22px]">
              Filter Content
            </Text>
            <Text className="text-theme-neutrals-400 text-[13px] mt-0.5">
              Choose type and time range
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            className="p-2 bg-white/5 rounded-full"
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          >
            <Ionicons
              name="close"
              size={20}
              color={theme.colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View className="px-5 pb-4">
          <View className="flex-row gap-3">
            {/* Left - Content Type */}
            <View className="flex-1">
              <View className="rounded-2xl border border-theme-neutrals-800 bg-black/15 overflow-hidden">
                <View className="flex-row items-center gap-2 px-4 pt-4 pb-3 border-b border-white/5">
                  <Ionicons
                    name="grid-outline"
                    size={16}
                    color={theme.colors.accent}
                  />
                  <Text className="text-theme-neutrals-100 text-[12px] font-bold uppercase tracking-wider">
                    Content Type
                  </Text>
                </View>
                <FlatList
                  data={statusOptions as StatusOption[]}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ padding: 12, paddingTop: 10 }}
                  ItemSeparatorComponent={ListSeparator}
                  renderItem={renderStatusItem}
                />
              </View>
            </View>

            {/* Right - Time Range */}
            <View className="w-36 shrink-0">
              <View className="rounded-2xl border border-theme-neutrals-800 bg-black/15 overflow-hidden">
                <View className="flex-row items-center gap-2 px-4 pt-4 pb-3 border-b border-white/5">
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={theme.colors.accent}
                  />
                  <Text className="text-theme-neutrals-100 text-[12px] font-bold uppercase tracking-wider">
                    Time
                  </Text>
                </View>
                <FlatList
                  data={rangeOptions}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ padding: 12, paddingTop: 10 }}
                  ItemSeparatorComponent={ListSeparator}
                  renderItem={renderRangeItem}
                />
              </View>
            </View>
          </View>

          {/* Apply Button */}
          <View className="pt-5 pb-2">
            <AccentButtonGradient borderRadius={14}>
              <TouchableOpacity
                className="py-4 rounded-xl items-center flex-row justify-center"
                onPress={handleApply}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Apply filters"
              >
                <View className="mr-2">
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={theme.colors.accentForeground}
                  />
                </View>
                <Text className="text-white text-base font-bold tracking-wide">
                  Apply Filters
                </Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          </View>
        </View>
      </SafeAreaView>
    </GlassModal>
  );
};

export default StatusFilterBottomSheet;
