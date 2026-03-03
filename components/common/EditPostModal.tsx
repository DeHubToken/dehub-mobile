/**
 * EditPostModal - Glass modal for editing post title, description & categories
 *
 * Uses GlassModal with center presentation and category chips.
 */
import React, { memo, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import CategoryDrawer from "../Upload/CategoryDrawer";
import { editPost, getCategoriesCached } from "../../services/nft.service";
import { toastSuccess, toastError } from "../../libs";
import { useKeyboard } from "../../hooks/useKeyboard";

interface EditPostModalProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string | undefined;
  initialTitle?: string;
  initialDescription?: string;
  initialCategories?: string[];
  onSuccess?: (data: {
    name?: string;
    description?: string;
    category?: string[];
  }) => void;
}

const EditPostModalComponent: React.FC<EditPostModalProps> = ({
  visible,
  onClose,
  tokenId,
  initialTitle = "",
  initialDescription = "",
  initialCategories = [],
  onSuccess,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [selectedCategories, setSelectedCategories] =
    useState<string[]>(initialCategories);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  // Sync when modal opens with latest props
  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setSelectedCategories(initialCategories);
    }
  }, [visible, initialTitle, initialDescription, initialCategories]);

  // Load categories when modal opens
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const load = async () => {
      setCategoriesLoading(true);
      try {
        const cats = await getCategoriesCached();
        if (!cancelled) setAllCategories(cats);
      } catch {
        // silent
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const addCategory = useCallback(
    (cat: string) => {
      const normalized = cat.trim();
      if (!normalized) return;
      setSelectedCategories((prev) => {
        if (prev.find((c) => c.toLowerCase() === normalized.toLowerCase())) return prev;
        if (prev.length >= 5) return prev;
        return [...prev, normalized];
      });
    },
    []
  );

  const removeCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== cat));
  }, []);

  const handleSave = useCallback(async () => {
    if (tokenId == null) return;
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();

    if (trimmedTitle.length > 0 && trimmedTitle.length < 3) {
      toastError("Title must be at least 3 characters");
      return;
    }
    if (trimmedDesc.length > 0 && trimmedDesc.length < 3) {
      toastError("Description must be at least 3 characters");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (trimmedTitle && trimmedTitle !== initialTitle) payload.name = trimmedTitle;
      if (trimmedDesc !== initialDescription) payload.description = trimmedDesc;
      if (
        JSON.stringify(selectedCategories.sort()) !==
        JSON.stringify([...(initialCategories || [])].sort())
      ) {
        payload.category = selectedCategories;
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      await editPost(tokenId, payload);
      toastSuccess("Post updated");
      onSuccess?.({
        name: payload.name,
        description: payload.description,
        category: payload.category,
      });
      onClose();
    } catch (e: any) {
      console.error("[EditPostModal] save error", e);
      toastError(e?.message || "Failed to update post");
    } finally {
      setSaving(false);
    }
  }, [
    tokenId,
    title,
    description,
    selectedCategories,
    initialTitle,
    initialDescription,
    initialCategories,
    onSuccess,
    onClose,
  ]);

  const hasChanges =
    title.trim() !== initialTitle ||
    description.trim() !== initialDescription ||
    JSON.stringify(selectedCategories.sort()) !==
      JSON.stringify([...(initialCategories || [])].sort());

  return (
    <GlassModal
      visible={visible}
      onClose={() => {
        if (!saving) onClose();
      }}
      presentation="center"
      maxHeight="85%"
      blurIntensity={40}
      dismissible={!saving}
    >
      <ScrollView
        className="p-5"
        contentContainerStyle={{ paddingBottom: kbVisible ? kbHeight + 16 : 8 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <View className="w-9 h-9 rounded-xl bg-blue-500/15 items-center justify-center mr-2">
              <Ionicons name="create-outline" size={18} color="#60A5FA" />
            </View>
            <Text className="text-white text-lg font-bold">Edit Post</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            disabled={saving}
            className="p-2 bg-white/5 rounded-full"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Title — only shown if the post has a title */}
        {initialTitle ? (
          <>
            <Text className="text-theme-neutrals-300 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, 140))}
              maxLength={140}
              placeholder="Post title"
              placeholderTextColor="#6B7280"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-1"
            />
            <Text className="text-theme-neutrals-500 text-[10px] text-right mb-3">
              {title.length}/140
            </Text>
          </>
        ) : null}

        {/* Description — only shown if the post has a description */}
        {initialDescription ? (
          <>
            <Text className="text-theme-neutrals-300 text-xs font-semibold uppercase tracking-wider mb-1.5">
              Description
            </Text>
            <TextInput
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, 500))}
              maxLength={500}
              placeholder="Post description"
              placeholderTextColor="#6B7280"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm min-h-[80px] mb-1"
            />
            <Text className="text-theme-neutrals-500 text-[10px] text-right mb-3">
              {description.length}/500
            </Text>
          </>
        ) : null}

        {/* Categories */}
        {categoriesLoading ? (
          <ActivityIndicator size="small" color="#9CA3AF" className="my-2" />
        ) : (
          <>
          <View className="mt-2">
            {selectedCategories.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mb-2">
                {selectedCategories.map((c) => (
                  <View
                    key={c}
                    className="flex-row items-center px-2.5 py-1 rounded-full bg-theme-accent/15 border border-theme-accent/30"
                  >
                    <Text className="text-theme-accent text-xs font-medium">
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </Text>
                    <TouchableOpacity onPress={() => removeCategory(c)} className="ml-1">
                      <Ionicons name="close" size={12} color="#256DFA" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {selectedCategories.length < 5 && (
              <TouchableOpacity
                onPress={() => setCategoryOpen(true)}
                activeOpacity={0.7}
                className="flex-row items-center"
              >
                <Ionicons name="pricetag-outline" size={18} color="#6F7174" />
                <Text className="text-theme-neutrals-400 text-sm ml-1.5">
                  Add categories
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <CategoryDrawer
            visible={categoryOpen}
            onClose={() => setCategoryOpen(false)}
            categories={selectedCategories}
            allCategories={allCategories}
            min={0}
            max={5}
            onAdd={addCategory}
            onRemove={removeCategory}
          />
          </>
        )}

        {/* Actions */}
        <View className="flex-row mt-2">
          <TouchableOpacity
            onPress={onClose}
            disabled={saving}
            className="flex-1 mr-2 py-3 rounded-xl bg-white/5 border border-white/10 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-theme-neutrals-300 text-sm font-medium">
              Cancel
            </Text>
          </TouchableOpacity>
          <View className="flex-1">
            <AccentButtonGradient borderRadius={12}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={saving || !hasChanges}
                className="py-3 items-center"
                style={{ opacity: hasChanges ? 1 : 0.4 }}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Save</Text>
                )}
              </TouchableOpacity>
            </AccentButtonGradient>
          </View>
        </View>
      </ScrollView>
    </GlassModal>
  );
};

const EditPostModal = memo(EditPostModalComponent);
export default EditPostModal;
