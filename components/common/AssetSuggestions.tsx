/**
 * Asset Suggestions
 * =================
 * The list that opens under a composer when somebody types `$`, so they choose
 * the token or stock instead of hoping the reader's card resolves to the one
 * they meant. Mobile counterpart of web's `AssetPickerDropdown`, and shaped like
 * `MentionSuggestions` so it drops into the same slot under a TextInput.
 */

import React, { memo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import type { AssetSuggestion } from "../../services/asset.service";

interface AssetSuggestionsProps {
  visible: boolean;
  suggestions: AssetSuggestion[];
  onSelect: (asset: AssetSuggestion) => void;
  loading?: boolean;
}

function formatPrice(value: number | null): string | null {
  if (value == null) return null;
  if (value >= 1000)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}

const AssetSuggestionsComponent: React.FC<AssetSuggestionsProps> = ({
  visible,
  suggestions,
  onSelect,
  loading,
}) => {
  const renderItem = useCallback(
    ({ item }: { item: AssetSuggestion }) => {
      const price = formatPrice(item.price);
      const change = item.changePercent24h;
      const positive = change == null ? true : change >= 0;
      const badge =
        item.assetClass === "stock"
          ? item.exchange || "Stock"
          : item.chainId || "Crypto";

      return (
        <TouchableOpacity
          onPress={() => onSelect(item)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-2.5"
        >
          {item.logo ? (
            <Image
              source={{ uri: item.logo }}
              style={{ width: 28, height: 28, borderRadius: 14 }}
              contentFit="cover"
            />
          ) : (
            <View
              className="items-center justify-center rounded-full bg-white/10"
              style={{ width: 28, height: 28 }}
            >
              <Text className="text-white/60 text-[9px] font-bold">
                {item.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 3)}
              </Text>
            </View>
          )}

          <View className="ml-2.5 flex-1">
            <View className="flex-row items-center">
              <Text className="text-white text-sm font-semibold" numberOfLines={1}>
                ${item.symbol}
              </Text>
              <View className="ml-1.5 px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10">
                <Text className="text-white/50 text-[9px] font-semibold uppercase leading-none">
                  {badge}
                </Text>
              </View>
            </View>
            <Text className="text-theme-neutrals-400 text-xs" numberOfLines={1}>
              {item.name}
            </Text>
          </View>

          {!!price && (
            <View className="items-end ml-2">
              <Text className="text-white/80 text-xs font-medium">{price}</Text>
              {change != null && (
                <Text
                  className="text-[10px]"
                  style={{ color: positive ? "#34d399" : "#f87171" }}
                >
                  {positive ? "+" : ""}
                  {change.toFixed(1)}%
                </Text>
              )}
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [onSelect],
  );

  if (!visible) return null;
  if (!loading && suggestions.length === 0) return null;

  return (
    <View
      className="rounded-2xl bg-black/95 border border-white/[0.08] overflow-hidden"
      style={{ maxHeight: 240 }}
    >
      <View className="flex-row items-center justify-between px-4 pt-2.5 pb-1">
        <Text className="text-white/40 text-[10px] font-semibold uppercase tracking-wider">
          Tokens & stocks
        </Text>
        {loading && <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />}
      </View>
      <FlatList
        data={suggestions}
        keyExtractor={(item, index) =>
          `${item.assetClass}:${item.symbol}:${item.address ?? item.exchange ?? index}`
        }
        renderItem={renderItem}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default memo(AssetSuggestionsComponent);
