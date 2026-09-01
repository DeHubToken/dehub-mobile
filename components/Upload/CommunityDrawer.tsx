/**
 * CommunityDrawer
 *
 * Picks which of the account's communities a post is filed under. A community
 * post is just a post carrying the community slug as a category — the same
 * contract web uses, and the same one CommunityFeedRoute reads back — so the
 * pick is written straight into the composer's category list.
 */
import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import type { Community } from "../../types/community";

export interface CommunityDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** The account's own communities — the only ones it can post into. */
  communities: Community[];
  /** Currently selected slug, if the post is already filed under one. */
  selectedSlug?: string;
  onSelect: (community: Community) => void;
  onClear: () => void;
}

const CommunityDrawer: React.FC<CommunityDrawerProps> = ({
  visible,
  onClose,
  communities,
  selectedSlug,
  onSelect,
  onClear,
}) => {
  const { height: screenHeight } = useWindowDimensions();

  const drawerHeight = Math.round(screenHeight * 0.6);

  const sorted = useMemo(
    () => [...communities].sort((a, b) => a.name.localeCompare(b.name)),
    [communities],
  );

  const handlePick = useCallback(
    (community: Community) => {
      if (community.slug === selectedSlug) {
        onClear();
      } else {
        onSelect(community);
      }
      onClose();
    },
    [selectedSlug, onSelect, onClear, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: Community }) => {
      const isSelected = item.slug === selectedSlug;
      return (
        <TouchableOpacity
          onPress={() => handlePick(item)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-3 border-b border-white/5"
        >
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              style={{ width: 34, height: 34, borderRadius: 17 }}
            />
          ) : (
            <View
              className="items-center justify-center bg-theme-neutrals-800"
              style={{ width: 34, height: 34, borderRadius: 17 }}
            >
              <Ionicons name="people" size={16} color="#9CA3AF" />
            </View>
          )}
          <View className="flex-1 ml-3">
            <Text className="text-white text-[15px]" numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="text-theme-neutrals-500 text-xs" numberOfLines={1}>
              /{item.slug}
            </Text>
          </View>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={20} color="#F4F4F5" />
          )}
        </TouchableOpacity>
      );
    },
    [selectedSlug, handlePick],
  );

  const keyExtractor = useCallback((item: Community) => item.id, []);

  return (
    <GlassModal
      visible={visible}
      onClose={onClose}
      presentation="bottom"
      maxHeight="65%"
      blurIntensity={40}
    >
      <View style={{ height: drawerHeight }}>
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-white text-lg font-bold">Community</Text>
          <TouchableOpacity onPress={onClose} hitSlop={14}>
            <Ionicons name="close" size={22} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={sorted}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={
            <View className="items-center px-8 py-10">
              <Text className="text-theme-neutrals-500 text-sm text-center">
                Join a community to post in one.
              </Text>
            </View>
          }
        />
      </View>
    </GlassModal>
  );
};

export default memo(CommunityDrawer);
