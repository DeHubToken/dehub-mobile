/**
 * EditPostModal - Glass modal for editing post title, description & categories
 *
 * Uses GlassModal with center presentation and category chips.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassModal from "../ui/GlassModal";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import MentionSuggestions from "../common/MentionSuggestions";
import CategoryDrawer from "../Upload/CategoryDrawer";
import * as ImagePicker from "expo-image-picker";
import { editPost, getCategoriesCached, replaceVideoFile, type ShopLink } from "../../services/nft.service";
import ShopSheet, { type ShopBoardDraft } from "../Upload/ShopSheet";
import { useStreamProducts, useStreamProductActions } from "../../hooks/useStreamShopping";
import { useShopLinkAllowance } from "../../hooks/useShopLinks";
import { toastSuccess, toastError } from "../../libs";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useMentions } from "../../hooks/useMentions";

interface EditPostModalProps {
  visible: boolean;
  onClose: () => void;
  tokenId: number | string | undefined;
  initialTitle?: string;
  initialDescription?: string;
  initialCategories?: string[];
  initialCommentsDisabled?: boolean;
  /** The Shop board already on the post. Empty means the toggle is off. */
  initialShopLinks?: ShopLink[];
  /** Absent means safe — the API stores nothing for the default. */
  initialContentRating?: string;
  /** Offer the "replace the file" row — creator, video post, not live. */
  canReplaceVideo?: boolean;
  onSuccess?: (data: {
    name?: string;
    description?: string;
    category?: string[];
    commentsDisabled?: boolean;
    contentRating?: string;
    shopLinks?: ShopLink[];
    shopListingCount?: number;
  }) => void;
}

const EditPostModalComponent: React.FC<EditPostModalProps> = ({
  visible,
  onClose,
  tokenId,
  initialTitle = "",
  initialDescription = "",
  initialCategories = [],
  initialCommentsDisabled = false,
  initialShopLinks,
  initialContentRating,
  canReplaceVideo = false,
  onSuccess,
}) => {
  const [commentsDisabled, setCommentsDisabled] = useState(initialCommentsDisabled);
  const [isMature, setIsMature] = useState(initialContentRating === "mature");
  const [shopLinks, setShopLinks] = useState<ShopLink[]>(initialShopLinks ?? []);
  const [shopSheetVisible, setShopSheetVisible] = useState(false);
  const shopAllowance = useShopLinkAllowance();
  /**
   * The post exists here, so its listings are read and written directly rather
   * than deferred the way the composer has to defer them. Only fetched while
   * the modal is open — every card can mount this.
   */
  const { products: attachedListings } = useStreamProducts(tokenId, visible);
  const { attach, detach } = useStreamProductActions(tokenId);
  const attachedIds = useMemo(() => attachedListings.map((p) => p.listing_id), [attachedListings]);
  const [pickedIds, setPickedIds] = useState<string[] | null>(null);
  // Null until the attached rows land, so an opening modal cannot momentarily
  // read as "the creator deselected everything" and detach a live rail.
  const listingIds = pickedIds ?? attachedIds;
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const titleMentions = useMentions(title, setTitle);
  const descMentions = useMentions(description, setDescription);
  const [selectedCategories, setSelectedCategories] =
    useState<string[]>(initialCategories);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState(0);

  /**
   * Pick a video and send it. Confirmed first: this overwrites the file every
   * existing link points at, and there is no undo once the transcode lands.
   */
  const handleReplaceVideo = useCallback(async () => {
    if (tokenId == null || replacing) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toastError("Media library permission is required");
      return;
    }

    // expo-image-picker renamed MediaTypeOptions; both spellings ship in the
    // versions this app has run on.
    const mediaTypes: any = (ImagePicker as any).MediaType
      ? [(ImagePicker as any).MediaType.video]
      : ImagePicker.MediaTypeOptions.Videos;

    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 1 });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;
    const asset = picked.assets[0];

    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Replace this video?",
        "The post keeps its link, views and comments. The file behind it is overwritten, and that cannot be undone.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Replace", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!confirmed) return;

    setReplacing(true);
    setReplaceProgress(0);
    try {
      await replaceVideoFile(
        tokenId,
        {
          uri: asset.uri,
          name: asset.fileName || `replacement_${Date.now()}.mp4`,
          type: asset.mimeType || "video/mp4",
        },
        { onProgress: (fraction) => setReplaceProgress(Math.round(fraction * 100)) },
      );
      toastSuccess("New file uploaded — it will swap in once it finishes processing");
    } catch (e: any) {
      toastError(e?.message || "Could not replace that file");
    } finally {
      setReplacing(false);
      setReplaceProgress(0);
    }
  }, [tokenId, replacing]);

  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  // Sync when modal opens with latest props
  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription(initialDescription);
      setSelectedCategories(initialCategories);
      setCommentsDisabled(initialCommentsDisabled);
    }
  }, [visible, initialTitle, initialDescription, initialCategories, initialCommentsDisabled]);

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
      if (commentsDisabled !== initialCommentsDisabled) {
        payload.commentsDisabled = commentsDisabled;
      }
      // The API stores nothing for a safe post, so an unrated one arrives as
      // undefined — compare against the rating it means, not the field.
      const nextRating = isMature ? "mature" : "safe";
      if (nextRating !== (initialContentRating ?? "safe")) {
        payload.contentRating = nextRating;
      }

      // Sent whole, including `[]` — that is the only way to clear a board,
      // and the server treats an empty array as exactly that.
      if (JSON.stringify(shopLinks) !== JSON.stringify(initialShopLinks ?? [])) {
        payload.shopLinks = shopLinks;
      }

      // Listings are Supabase rows written by the stream-products function, not
      // fields on the post — so they are reconciled separately, and only the
      // count goes on the token for the cards to read.
      const toAttach = listingIds.filter((id) => !attachedIds.includes(id));
      const toDetach = attachedIds.filter((id) => !listingIds.includes(id));
      if (toAttach.length || toDetach.length) {
        payload.shopListingCount = listingIds.length;
      }

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      // Before the post update, so a failure to reconcile the rail is a visible
      // error rather than a count on the token that nothing backs.
      for (const id of toDetach) await detach.mutateAsync(id);
      for (const id of toAttach) await attach.mutateAsync({ listingId: id });

      await editPost(tokenId, payload);
      toastSuccess("Post updated");
      onSuccess?.({
        name: payload.name,
        description: payload.description,
        category: payload.category,
        commentsDisabled: payload.commentsDisabled,
        contentRating: payload.contentRating,
        shopLinks: payload.shopLinks,
        shopListingCount: payload.shopListingCount as number | undefined,
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
    commentsDisabled,
    isMature,
    shopLinks,
    listingIds,
    attachedIds,
    attach,
    detach,
    initialTitle,
    initialDescription,
    initialCategories,
    initialCommentsDisabled,
    initialShopLinks,
    initialContentRating,
    onSuccess,
    onClose,
  ]);

  const hasChanges =
    title.trim() !== initialTitle ||
    description.trim() !== initialDescription ||
    commentsDisabled !== initialCommentsDisabled ||
    (isMature ? "mature" : "safe") !== (initialContentRating ?? "safe") ||
    JSON.stringify(shopLinks) !== JSON.stringify(initialShopLinks ?? []) ||
    JSON.stringify([...listingIds].sort()) !== JSON.stringify([...attachedIds].sort()) ||
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
              <Ionicons name="create-outline" size={18} color="#D4D4D8" />
            </View>
            <Text className="text-white text-lg font-bold">Edit Post</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            disabled={saving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="p-2 bg-white/5 rounded-full"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color="#A6A9AC" />
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
              onChangeText={(t) => titleMentions.handleChangeText(t.slice(0, 140))}
              onSelectionChange={titleMentions.handleSelectionChange}
              maxLength={140}
              placeholder="Post title"
              placeholderTextColor="#8B8D90"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-1"
            />
            <MentionSuggestions
              visible={titleMentions.showSuggestions}
              suggestions={titleMentions.suggestions}
              onSelect={titleMentions.selectMention}
              loading={titleMentions.loading}
            />
            <Text className="text-theme-neutrals-500 text-xs text-right mb-3">
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
              onChangeText={(t) => descMentions.handleChangeText(t.slice(0, 500))}
              onSelectionChange={descMentions.handleSelectionChange}
              maxLength={500}
              placeholder="Post description"
              placeholderTextColor="#8B8D90"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm min-h-[80px] mb-1"
            />
            <MentionSuggestions
              visible={descMentions.showSuggestions}
              suggestions={descMentions.suggestions}
              onSelect={descMentions.selectMention}
              loading={descMentions.loading}
            />
            <Text className="text-theme-neutrals-500 text-xs text-right mb-3">
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
                      <Ionicons name="close" size={12} color="#F4F4F5" />
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

          {/* Shop board. Affiliate links a creator forgot to add at upload —
              the composer offers the same editor. */}
          <TouchableOpacity
            onPress={() => setShopSheetVisible(true)}
            activeOpacity={0.7}
            className="flex-row items-center justify-between mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/10"
          >
            <View className="flex-1 mr-3">
              <Text className="text-white text-sm font-semibold">
                {shopLinks.length + listingIds.length
                  ? `${shopLinks.length + listingIds.length} on the Shop board`
                  : "Add to the Shop board"}
              </Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                Your shop listings and affiliate links, opened from the Shop button. You can add{" "}
                {shopAllowance.allowance}.
              </Text>
            </View>
            <Ionicons name="bag-outline" size={18} color="#6F7174" />
          </TouchableOpacity>

          {/* Comments toggle. Mirrors web's EditPostModal so the same post
              reads the same on both clients. */}
          <TouchableOpacity
            onPress={() => setCommentsDisabled((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: !commentsDisabled }}
            className="flex-row items-center justify-between mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/10"
          >
            <View className="flex-1 mr-3">
              <Text className="text-white text-sm font-semibold">
                {commentsDisabled ? "Comments are off" : "Allow comments"}
              </Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                {commentsDisabled
                  ? "Replies already posted stay visible — turning this back on restores them."
                  : "Anyone who can see this post can reply to it."}
              </Text>
            </View>
            <View
              className={`w-11 h-6 rounded-full justify-center ${
                commentsDisabled ? "bg-neutral-700" : "bg-green-500"
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white ${
                  commentsDisabled ? "ml-0.5" : "ml-[22px]"
                }`}
              />
            </View>
          </TouchableOpacity>

          {/* Content rating. Same switch the composer carries, for a post that
              is already out — refused with 403 once a moderator has rated it,
              and that message surfaces as-is. */}
          <TouchableOpacity
            onPress={() => setIsMature((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: isMature }}
            className="flex-row items-center justify-between mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/10"
          >
            <View className="flex-1 mr-3">
              <Text className="text-white text-sm font-semibold">
                {isMature ? "Marked mature" : "Mark as mature"}
              </Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                {isMature
                  ? "Kept off the public feed. Followers, your profile and the link still work."
                  : "For adult or graphic posts. Turning this on takes it off the public feed."}
              </Text>
            </View>
            <View
              className={`w-11 h-6 rounded-full justify-center ${
                isMature ? "bg-amber-500" : "bg-neutral-700"
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white ${
                  isMature ? "ml-[22px]" : "ml-0.5"
                }`}
              />
            </View>
          </TouchableOpacity>

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

        {/* Replace the file behind the post. The post survives — same link,
            same views, same comments — which is the entire reason this exists
            rather than "delete and re-upload over a typo in the last render". */}
        {canReplaceVideo && (
          <View className="mt-4">
            <Text className="text-theme-neutrals-300 text-xs font-medium mb-2">
              Video file
            </Text>
            <TouchableOpacity
              onPress={handleReplaceVideo}
              disabled={replacing || saving}
              activeOpacity={0.8}
              className="flex-row items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"
              style={{ opacity: replacing || saving ? 0.6 : 1 }}
            >
              <View className="flex-1 mr-3">
                <Text className="text-white text-sm font-medium">
                  {replacing
                    ? `Uploading… ${replaceProgress}%`
                    : "Replace video file"}
                </Text>
                <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                  Keeps this post's link, views and comments. The old file plays
                  until the new one finishes processing.
                </Text>
              </View>
              {replacing ? (
                <ActivityIndicator size="small" color="#a1a1aa" />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color="#a1a1aa" />
              )}
            </TouchableOpacity>
          </View>
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

      <ShopSheet
        visible={shopSheetVisible}
        onClose={() => setShopSheetVisible(false)}
        value={{ links: shopLinks, listingIds }}
        onSave={(next: ShopBoardDraft) => {
          setShopLinks(next.links);
          setPickedIds(next.listingIds);
        }}
        allowance={shopAllowance.allowance}
        tier={shopAllowance.tier}
      />
    </GlassModal>
  );
};

const EditPostModal = memo(EditPostModalComponent);
export default EditPostModal;
