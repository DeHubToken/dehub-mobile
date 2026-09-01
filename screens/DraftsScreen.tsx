import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenHeader from "../components/ScreenHeader";
import { useUser, useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useDrafts } from "../hooks/useDrafts";
import type { Draft } from "../hooks/useDrafts";
import { ScreenNames } from "../navigation/ScreenNames";


const formatRelativeDate = (epoch: number): string => {
  const diff = Date.now() - epoch;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epoch).toLocaleDateString();
};

const getMediaLabel = (d: Draft): string => {
  if (d.videoUri) return "Video";
  if (d.imageUris.length > 0) return `${d.imageUris.length} image${d.imageUris.length > 1 ? "s" : ""}`;
  return "Text";
};


interface DraftItemProps {
  draft: Draft;
  onPress: (draft: Draft) => void;
  onDelete: (id: string) => void;
}

const DraftItem: React.FC<DraftItemProps> = React.memo(
  ({ draft, onPress, onDelete }) => {
    const handlePress = useCallback(() => onPress(draft), [draft, onPress]);
    const handleDelete = useCallback(() => onDelete(draft.id), [draft.id, onDelete]);

    const preview = draft.bodyText.trim() || draft.titleText?.trim() || "";
    const mediaLabel = getMediaLabel(draft);
    const time = formatRelativeDate(draft.createdAt);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        className="flex-row items-center px-4 py-4 border-b border-theme-neutrals-800"
      >
        {/* Icon */}
        <View className="w-10 h-10 rounded-full bg-theme-neutrals-800 items-center justify-center mr-3">
          <Ionicons
            name={draft.videoUri ? "videocam" : draft.imageUris.length > 0 ? "image" : "document-text"}
            size={20}
            color="#6F7174"
          />
        </View>

        {/* Content */}
        <View className="flex-1 mr-3">
          <Text className="text-white text-base font-medium" numberOfLines={1}>
            {preview}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text className="text-theme-neutrals-400 text-xs">{mediaLabel}</Text>
            <Text className="text-theme-neutrals-600 text-xs mx-1.5">·</Text>
            <Text className="text-theme-neutrals-400 text-xs">{time}</Text>
            {draft.categories.length > 0 && (
              <>
                <Text className="text-theme-neutrals-600 text-xs mx-1.5">·</Text>
                <Text className="text-theme-neutrals-400 text-xs" numberOfLines={1}>
                  {draft.categories.slice(0, 2).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Trash button */}
        <TouchableOpacity
          onPress={handleDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-9 h-9 items-center justify-center"
        >
          <Ionicons name="trash-outline" size={20} color="#F4F4F5" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  },
);


const DraftsScreen: React.FC = () => {
  const { t } = useTranslation();
  const authUser = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);

  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { drafts, loading, reload, deleteDraft } = useDrafts(authUser?.address);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleRestore = useCallback(
    (draft: Draft) => {
      // Navigate to Upload with the draft data
      nav.navigate(ScreenNames.Upload, { draft });
    },
    [nav],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteDraft(id);
    },
    [deleteDraft],
  );

  const renderItem = useCallback(
    ({ item }: { item: Draft }) => (
      <DraftItem draft={item} onPress={handleRestore} onDelete={handleDelete} />
    ),
    [handleRestore, handleDelete],
  );

  const keyExtractor = useCallback((item: Draft) => item.id, []);

  const EmptyState = useMemo(
    () => (
      <View className="flex-1 items-center justify-center px-8 pt-24">
        <Ionicons name="document-text-outline" size={48} color="#6F7174" />
        <Text className="text-theme-neutrals-400 text-base mt-4 text-center">
          No drafts yet
        </Text>
        <Text className="text-theme-neutrals-500 text-sm mt-1 text-center">
          When you save a post as draft, it will appear here.
        </Text>
      </View>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title={t("screens.drafts")} />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <FlatList
          data={drafts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + 20,
          }}
          ListEmptyComponent={EmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

export default DraftsScreen;
