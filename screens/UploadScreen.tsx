/**
 * UploadScreen (v2)
 *
 * Twitter/X-style compose screen.
 * The previous implementation is preserved at `screens/_UploadScreenLegacy.tsx`
 * so we can extract functionality from it as needed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Pressable,
  BackHandler,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
  ensureMediaLibraryPermission,
  waitAfterPermissionIfNeeded,
  runWithPermissions,
} from "../libs/permissions.util";
import { openCroppedImagePicker } from "../libs/assets.util";
import { getCategoriesCached } from "../services/nft.service";
import { toastError } from "../libs/toast";
import { useAuth } from "../context/AuthContext";
import { useKeyboard } from "../hooks/useKeyboard";
import { getAvatarUrl } from "../libs/misc";
import Avatar from "../components/common/Avatar";
import AccentButtonGradient from "../components/ui/AccentButtonGradient";
import UploadCategoriesSelector from "../components/Upload/UploadCategoriesSelector";
import MonetizationPanel from "../components/Upload/MonetizationPanel";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";
import ConfirmUploadModal from "../components/Upload/ConfirmUploadModal";
import { useUploadPost } from "../hooks/useUploadPost";
import { useDrafts } from "../hooks/useDrafts";
import type { Draft } from "../hooks/useDrafts";
import GlassModal from "../components/ui/GlassModal";
import type { UploadPayload } from "../hooks/useUploadPost";
import type { AppStackParamList } from "../navigation/types";
import { ScreenNames } from "../navigation/ScreenNames";

// ── constants ──────────────────────────────────────────
const TITLE_MAX = 140;
const DESCRIPTION_MAX = 500;
const IMAGES_MAX = 4;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per image
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
const CATEGORIES_MIN = 0;
const CATEGORIES_MAX = 5;

type PickedAsset = ImagePicker.ImagePickerAsset;
type MediaMode = "none" | "images" | "video";

export default function UploadScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, typeof ScreenNames.Upload>>();
  const incomingDraft = route.params?.draft as Draft | undefined;
  const { user: authUser } = useAuth() as any;
  const insets = useSafeAreaInsets();
  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
  const { saveDraft, deleteDraft } = useDrafts();

  const avatarUri = useMemo(
    () => getAvatarUrl(authUser?.avatarImageUrl),
    [authUser?.avatarImageUrl],
  );

  // ── state ──────────────────────────────────────────────
  const [bodyText, setBodyText] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [pickedImages, setPickedImages] = useState<PickedAsset[]>([]);
  const [pickedVideo, setPickedVideo] = useState<PickedAsset | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [showDescription, setShowDescription] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [showMonetization, setShowMonetization] = useState(false);
  const [monetization, setMonetization] = useState<MonetizationState>({
    ppvEnabled: false,
    ppvData: { price: "" },
    bountyEnabled: false,
    bountyData: { viewers: "", commenters: "", rewardPerPerson: "" },
    tokenGatedEnabled: false,
    tokenGateData: { minAmount: "" },
  });
  const [autoExpandSection, setAutoExpandSection] = useState<
    "ppv" | "bounty" | "tokenGated" | null
  >(null);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverHidden, setCoverHidden] = useState(false);

  // ── draft modal states ─────────────────────────────────
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  /** Track the draft id if we're editing one (so we can delete on save/post) */
  const restoredDraftIdRef = useRef<string | null>(null);

  // ── reanimated: monetization slide ─────────────────────
  const monetizationProgress = useSharedValue(0);

  useEffect(() => {
    monetizationProgress.value = withTiming(showMonetization ? 1 : 0, {
      duration: 250,
    });
  }, [showMonetization, monetizationProgress]);

  const monetizationAnimStyle = useAnimatedStyle(() => ({
    opacity: monetizationProgress.value,
    maxHeight: monetizationProgress.value * 600,
    overflow: "hidden" as const,
  }));

  // ── derived ────────────────────────────────────────────
  const mediaMode: MediaMode = useMemo(() => {
    if (pickedVideo) return "video";
    if (pickedImages.length > 0) return "images";
    return "none";
  }, [pickedVideo, pickedImages.length]);

  const hasMedia = mediaMode !== "none";
  const hasContent = bodyText.trim().length > 0 || hasMedia;
  const canPost = bodyText.trim().length > 0 || hasMedia;

  // Show description/category area when user has typed or picked media
  // Once opened, they stay even if title is cleared (to preserve filled data)
  const showExtras = hasContent || showDescription || showCategory
    || description.length > 0 || categories.length > 0;

  // image button disabled when: video selected OR 4 images already
  const imageDisabled = mediaMode === "video" || pickedImages.length >= IMAGES_MAX;
  // video button disabled when: any media is selected
  const videoDisabled = hasMedia;

  // ── video player ───────────────────────────────────────
  const player = useVideoPlayer(pickedVideo?.uri ?? null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  useEffect(() => {
    if (pickedVideo) {
      player.muted = isMuted;
    }
  }, [isMuted, pickedVideo, player]);

  // ── categories ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCategoriesCached();
        if (mounted) setAllCategories(data);
      } catch (e) {
        console.warn("[UploadScreen] Failed to load categories", e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ── restore from draft ─────────────────────────────────
  useEffect(() => {
    if (!incomingDraft) return;
    restoredDraftIdRef.current = incomingDraft.id;
    setBodyText(incomingDraft.bodyText);
    setDescription(incomingDraft.description);
    setCategories(incomingDraft.categories);
    if (incomingDraft.description.length > 0) setShowDescription(true);
    if (incomingDraft.categories.length > 0) setShowCategory(true);
    if (incomingDraft.thumbnailUri) setThumbnailUri(incomingDraft.thumbnailUri);
    if (incomingDraft.coverUri) setCoverUri(incomingDraft.coverUri);
    setMonetization(incomingDraft.monetization);

    // Restore images (we can only restore URIs — they may be stale)
    if (incomingDraft.imageUris.length > 0) {
      const assets = incomingDraft.imageUris.map((uri) => ({
        uri,
        width: 0,
        height: 0,
        assetId: undefined,
      })) as any[];
      setPickedImages(assets);
    }
    // Restore video
    if (incomingDraft.videoUri) {
      setPickedVideo({
        uri: incomingDraft.videoUri,
        width: 0,
        height: 0,
        assetId: undefined,
      } as any);
    }
    // Delete the draft — it's now restored into the editor
    deleteDraft(incomingDraft.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addCategory = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      if (categories.find((c) => c.toLowerCase() === n.toLowerCase())) return;
      if (categories.length >= CATEGORIES_MAX) return;
      setCategories((prev) => [...prev, n]);
      setCategoryQuery("");
      setCategoryOpen(false);
    },
    [categories],
  );

  const removeCategory = useCallback((name: string) => {
    setCategories((prev) =>
      prev.filter((c) => c.toLowerCase() !== name.toLowerCase()),
    );
  }, []);

  // ── derived: form has content ──────────────────────────
  const formHasContent = useMemo(
    () =>
      bodyText.trim().length > 0 ||
      description.trim().length > 0 ||
      categories.length > 0 ||
      pickedImages.length > 0 ||
      !!pickedVideo,
    [bodyText, description, categories, pickedImages, pickedVideo],
  );

  // ── handlers ───────────────────────────────────────────
  /** Close handler – placed before useUploadPost; isUploading guard is in the X button's disabled prop */
  const handleClose = useCallback(() => {
    if (formHasContent) {
      setShowDiscardModal(true);
    } else {
      nav.goBack();
    }
  }, [nav, formHasContent]);

  const handleBodyChange = useCallback((text: string) => {
    if (text.length <= TITLE_MAX) setBodyText(text);
  }, []);

  const handleDescriptionChange = useCallback((text: string) => {
    if (text.length <= DESCRIPTION_MAX) setDescription(text);
  }, []);

  // ── upload hook ──────────────────────────────────────
  const {
    validate,
    preUploadCheck,
    buildConfirmText,
    upload,
    uploadStage,
    isUploading,
  } = useUploadPost();

  // Intercept Android back button (placed after useUploadPost for isUploading)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isUploading) return true; // prevent closing during upload
      if (formHasContent) {
        setShowDiscardModal(true);
        return true;
      }
      return false; // let default back happen
    });
    return () => sub.remove();
  }, [formHasContent, isUploading]);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const getPayload = useCallback((): UploadPayload => ({
    bodyText,
    description,
    categories,
    pickedImages,
    pickedVideo,
    thumbnailUri,
    coverUri,
    monetization,
  }), [bodyText, description, categories, pickedImages, pickedVideo, thumbnailUri, coverUri, monetization]);

  const handlePost = useCallback(() => {
    if (!canPost || isUploading) return;
    const payload = getPayload();

    // Validate form
    const validation = validate(payload);
    if (!validation.valid) {
      toastError(validation.error ?? "Please fill in required fields.");
      return;
    }

    // Pre-upload checks (gas, balance)
    const preCheck = preUploadCheck(payload);
    if (!preCheck.valid) {
      toastError(preCheck.error ?? "Pre-upload check failed.");
      return;
    }

    // Build confirmation text and show modal
    const text = buildConfirmText(payload);
    setConfirmText(text);
    setShowConfirm(true);
  }, [canPost, isUploading, getPayload, validate, preUploadCheck, buildConfirmText]);

  const handleConfirmUpload = useCallback(async () => {
    const payload = getPayload();
    await upload(payload);
    // If upload succeeds, the hook navigates away.
    // If it fails, the modal stays open and user can retry or cancel.
  }, [getPayload, upload]);

  // ── draft handlers ─────────────────────────────────────
  const buildDraftData = useCallback(() => ({
    bodyText,
    description,
    categories,
    imageUris: pickedImages.map((img) => img.uri),
    videoUri: pickedVideo?.uri ?? null,
    thumbnailUri,
    coverUri,
    monetization,
  }), [bodyText, description, categories, pickedImages, pickedVideo, thumbnailUri, coverUri, monetization]);

  /** "Draft" button in top bar */
  const handleDraftButton = useCallback(() => {
    if (formHasContent) {
      setShowSaveDraftModal(true);
    }
  }, [formHasContent]);

  /** Confirm save to draft from the save-draft modal */
  const handleConfirmSaveDraft = useCallback(async () => {
    setShowSaveDraftModal(false);
    await saveDraft(buildDraftData());
    nav.goBack();
  }, [saveDraft, buildDraftData, nav]);

  /** "Save Draft" from discard warning modal */
  const handleDiscardSaveDraft = useCallback(async () => {
    setShowDiscardModal(false);
    await saveDraft(buildDraftData());
    nav.goBack();
  }, [saveDraft, buildDraftData, nav]);

  /** "Discard" from discard warning modal */
  const handleDiscard = useCallback(() => {
    setShowDiscardModal(false);
    nav.goBack();
  }, [nav]);

  const handlePickImage = useCallback(async () => {
    if (imageDisabled) return;
    try {
      const perm = await ensureMediaLibraryPermission();
      if (!perm.granted) return;
      await waitAfterPermissionIfNeeded(perm.justGranted);

      const remaining = IMAGES_MAX - pickedImages.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length) {
        // Filter out oversized images
        const validAssets: PickedAsset[] = [];
        for (const asset of result.assets) {
          try {
            const info = await FileSystem.getInfoAsync(asset.uri);
            const size = (info as any)?.size as number | undefined;
            if (size && size > MAX_IMAGE_SIZE_BYTES) {
              toastError(`Image exceeds 20 MB limit and was skipped.`);
              continue;
            }
          } catch {}
          validAssets.push(asset);
        }
        if (validAssets.length > 0) {
          setPickedImages((prev) =>
            [...prev, ...validAssets].slice(0, IMAGES_MAX),
          );
        }
      }
    } catch (err) {
      console.error("[UploadScreen] image pick error:", err);
    }
  }, [imageDisabled, pickedImages.length]);

  const generateThumbnail = useCallback(async (uri: string) => {
    try {
      const res = await VideoThumbnails.getThumbnailAsync(uri, {
        time: 0,
        quality: 0.6,
      });
      setThumbnailUri(res.uri);
    } catch (err) {
      console.warn("[UploadScreen] thumbnail generation failed:", err);
      setThumbnailUri(null);
    }
  }, []);

  const handlePickCoverImage = useCallback(async () => {
    try {
      await runWithPermissions([ensureMediaLibraryPermission], async () => {
        const picked = await openCroppedImagePicker({
          width: 640,
          height: 360,
          quality: 0.9,
          forceJpg: true,
        });
        if (picked) {
          setCoverUri(picked);
          setCoverHidden(false);
        }
      });
    } catch (err) {
      console.error("[UploadScreen] cover image pick error:", err);
    }
  }, []);

  const toggleCoverHidden = useCallback(() => {
    setCoverHidden((prev) => !prev);
  }, []);

  const handlePickVideo = useCallback(async () => {
    if (videoDisabled) return;
    try {
      const perm = await ensureMediaLibraryPermission();
      if (!perm.granted) return;
      await waitAfterPermissionIfNeeded(perm.justGranted);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        try {
          const info = await FileSystem.getInfoAsync(asset.uri);
          const size = (info as any)?.size as number | undefined;
          if (size && size > MAX_VIDEO_SIZE_BYTES) {
            toastError("Video exceeds 200 MB limit. Please choose a smaller file.");
            return;
          }
        } catch {}
        setPickedVideo(asset);
        setCoverUri(null);
        generateThumbnail(asset.uri);
      }
    } catch (err) {
      console.error("[UploadScreen] video pick error:", err);
    }
  }, [videoDisabled, generateThumbnail]);

  const handleChangeVideo = useCallback(async () => {
    try {
      const perm = await ensureMediaLibraryPermission();
      if (!perm.granted) return;
      await waitAfterPermissionIfNeeded(perm.justGranted);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        try {
          const info = await FileSystem.getInfoAsync(asset.uri);
          const size = (info as any)?.size as number | undefined;
          if (size && size > MAX_VIDEO_SIZE_BYTES) {
            toastError("Video exceeds 200 MB limit. Please choose a smaller file.");
            return;
          }
        } catch {}
        setPickedVideo(asset);
        setCoverUri(null);
        generateThumbnail(asset.uri);
      }
    } catch (err) {
      console.error("[UploadScreen] video change error:", err);
    }
  }, [generateThumbnail]);

  const handleRemoveImage = useCallback((index: number) => {
    setPickedImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveVideo = useCallback(() => {
    setPickedVideo(null);
    setIsMuted(true);
    setShowMonetization(false);
    setThumbnailUri(null);
    setCoverUri(null);
    setCoverHidden(false);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [isPlaying, player]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleShowDescription = useCallback(() => {
    setShowDescription(true);
    setTimeout(() => descriptionRef.current?.focus(), 100);
  }, []);

  const handleToggleCategory = useCallback(() => {
    setCategoryOpen(true);
    setShowCategory(true);
  }, []);

  const dismissCategory = useCallback(() => {
    if (categoryOpen) {
      setCategoryOpen(false);
      setShowCategory(false);
    }
  }, [categoryOpen]);

  const toggleMonetization = useCallback(() => {
    setShowMonetization((prev) => !prev);
    setAutoExpandSection(null);
  }, []);

  const handleMonetizationChange = useCallback((next: MonetizationState) => {
    setMonetization(next);
  }, []);

  const handleAutoExpandHandled = useCallback(() => {
    setAutoExpandSection(null);
  }, []);

  const openMonetizationSection = useCallback(
    (section: "ppv" | "bounty" | "tokenGated") => {
      setShowMonetization(true);
      setAutoExpandSection(section);
    },
    [],
  );

  // ── bottom padding ─────────────────────────────────────
  const bottomPad = kbVisible ? kbHeight : insets.bottom;

  // ── render ─────────────────────────────────────────────
  return (
    <View className="flex-1 bg-black">{/* don't add top inset */}
      {/* ── Top bar ─────────────────────────────────── */}
      <View className="flex-row items-center justify-between px-4 h-14">
        <TouchableOpacity
          onPress={handleClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>

        <View className="flex-row items-center">
          {formHasContent && !isUploading && (
            <TouchableOpacity
              onPress={handleDraftButton}
              activeOpacity={0.7}
              className="mr-3"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-theme-accent font-semibold text-sm">Draft</Text>
            </TouchableOpacity>
          )}

          <AccentButtonGradient style={{ opacity: canPost ? 1 : 0.5 }}>
            <TouchableOpacity
              onPress={handlePost}
              disabled={!canPost || isUploading}
              activeOpacity={0.8}
              className="px-5 py-2"
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-bold text-sm">Post</Text>
              )}
            </TouchableOpacity>
          </AccentButtonGradient>
        </View>
      </View>

      {/* ── Scrollable compose ────────────────────────── */}
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={dismissCategory}
      >
        <Pressable onPress={dismissCategory} className="flex-1">
        <View className="flex-row px-4 pt-2">
          {/* Avatar column */}
          <View className="pt-1 mr-3">
            <Avatar
              uri={
                avatarUri && avatarUri !== "default-avatar"
                  ? avatarUri
                  : undefined
              }
              size={40}
              rounded
            />
          </View>

          {/* Main content column */}
          <View className="flex-1">
            {/* Title input */}
            <TextInput
              ref={titleRef}
              value={bodyText}
              onChangeText={handleBodyChange}
              placeholder="What's happening?"
              placeholderTextColor="#6F7174"
              maxLength={TITLE_MAX}
              multiline
              blurOnSubmit={false}
              returnKeyType="default"
              className="text-white text-lg"
              style={{ textAlignVertical: "top" }}
              autoFocus
              scrollEnabled={false}
            />
            {/* Character counter */}
            <Text
              className={`text-xs mt-1 self-end ${
                bodyText.length >= TITLE_MAX
                  ? "text-theme-red-500"
                  : "text-theme-neutrals-500"
              }`}
            >
              {bodyText.length}/{TITLE_MAX}
            </Text>

            {/* ── Image previews ──────────────────────── */}
            {mediaMode === "images" && (
              <View className="mt-3 flex-row flex-wrap -m-1">
                {pickedImages.map((img, idx) => (
                  <View
                    key={`img-${img.assetId || img.uri}-${idx}`}
                    className="w-1/2 p-1"
                  >
                    <View className="rounded-xl overflow-hidden border border-theme-neutrals-700">
                      <Image
                        source={{ uri: img.uri }}
                        className="w-full h-40"
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        onPress={() => handleRemoveImage(idx)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full items-center justify-center bg-black/70"
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        <Ionicons name="close" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {pickedImages.length < IMAGES_MAX && (
                  <View className="w-1/2 p-1">
                    <TouchableOpacity
                      onPress={handlePickImage}
                      className="h-40 rounded-xl border border-dashed border-theme-neutrals-700 bg-theme-neutrals-800 items-center justify-center"
                    >
                      <Ionicons name="add" size={28} color="#6F7174" />
                      <Text className="text-theme-neutrals-500 text-xs mt-1">
                        Add more
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Video preview ───────────────────────── */}
            {mediaMode === "video" && pickedVideo && (
              <View className="mt-3 rounded-xl overflow-hidden border border-theme-neutrals-700 relative">
                <VideoView
                  player={player}
                  style={{ width: "100%", height: 220, backgroundColor: "#111" }}
                  contentFit="contain"
                  nativeControls={false}
                />
                {/* Overlay controls */}
                <View className="absolute inset-0 items-center justify-center">
                  <TouchableOpacity
                    onPress={handleTogglePlay}
                    className="w-12 h-12 rounded-full bg-black/50 items-center justify-center"
                  >
                    <Ionicons
                      name={isPlaying ? "pause" : "play"}
                      size={24}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
                {/* Mute toggle */}
                <TouchableOpacity
                  onPress={handleToggleMute}
                  className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-black/60 items-center justify-center"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons
                    name={isMuted ? "volume-mute" : "volume-high"}
                    size={16}
                    color="#fff"
                  />
                </TouchableOpacity>
                {/* Remove video */}
                <TouchableOpacity
                  onPress={handleRemoveVideo}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 items-center justify-center"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
                {/* Change video (pencil) */}
                <TouchableOpacity
                  onPress={handleChangeVideo}
                  className="absolute top-2 right-12 w-8 h-8 rounded-full bg-black/70 items-center justify-center"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Ionicons name="pencil" size={16} color="#fff" />
                </TouchableOpacity>
                {/* Thumbnail overlay – bottom-right */}
                {(thumbnailUri || coverUri) && !coverHidden && (
                  <View className="absolute bottom-2 right-2">
                    <TouchableOpacity
                      onPress={handlePickCoverImage}
                      activeOpacity={0.8}
                      className="relative rounded-lg overflow-hidden border border-white/30"
                      style={{ width: 80, height: 45 }}
                    >
                      <Image
                        source={{ uri: coverUri ?? thumbnailUri! }}
                        style={{ width: 80, height: 45 }}
                        resizeMode="cover"
                      />
                      {/* Pencil overlay */}
                      <View className="absolute inset-0 bg-black/40 items-center justify-center">
                        <Ionicons name="pencil" size={20} color="#fff" />
                      </View>
                    </TouchableOpacity>
                    {/* Eye-off to hide thumbnail */}
                    <TouchableOpacity
                      onPress={toggleCoverHidden}
                      className="absolute -top-2 right-1 w-5 h-5 rounded-full bg-black/70 items-center justify-center"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="eye-off" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Show cover toggle – visible only when cover is hidden */}
            {mediaMode === "video" && coverHidden && (thumbnailUri || coverUri) && (
              <TouchableOpacity
                onPress={toggleCoverHidden}
                activeOpacity={0.7}
                className="mt-2 flex-row items-center self-end"
              >
                <Ionicons name="eye" size={14} color="#6F7174" />
                <Text className="text-theme-neutrals-400 text-xs ml-1">
                  Show cover
                </Text>
              </TouchableOpacity>
            )}

            {/* ── Description & Category section ─────────── */}
            {showExtras && (
              <View className="mt-4">
                {/* Description: toggle text or expanded input */}
                {!showDescription ? (
                  <TouchableOpacity
                    onPress={handleShowDescription}
                    activeOpacity={0.7}
                    className="flex-row items-center"
                  >
                    <Ionicons name="document-text-outline" size={18} color="#6F7174" />
                    <Text className="text-theme-neutrals-400 text-sm ml-1.5">
                      Add description
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View>
                    <TextInput
                      ref={descriptionRef}
                      value={description}
                      onChangeText={handleDescriptionChange}
                      placeholder="Add a description…"
                      placeholderTextColor="#6F7174"
                      multiline
                      blurOnSubmit={false}
                      returnKeyType="default"
                      maxLength={DESCRIPTION_MAX}
                      className="text-white text-sm"
                      style={{ textAlignVertical: "top" }}
                      scrollEnabled={false}
                    />
                    <Text
                      className={`text-xs mt-1 self-end ${
                        description.length >= DESCRIPTION_MAX
                          ? "text-theme-red-500"
                          : "text-theme-neutrals-500"
                      }`}
                    >
                      {description.length}/{DESCRIPTION_MAX}
                    </Text>
                  </View>
                )}

                {/* Category: selected pills + toggle text or expanded picker */}
                <View className="mt-4">
                  {/* Always show selected category pills */}
                  {categories.length > 0 && (
                    <View className="flex-row flex-wrap gap-2 mb-2">
                      {categories.map((c) => (
                        <View
                          key={c}
                          className="flex-row items-center px-2 py-1 rounded-lg bg-theme-neutrals-800 border border-theme-neutrals-700"
                        >
                          <Text className="text-white text-xs">{c}</Text>
                          <TouchableOpacity
                            onPress={() => removeCategory(c)}
                            className="ml-1"
                          >
                            <Ionicons name="close-circle" size={14} color="#6F7174" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Show picker when open, otherwise show "Add categories" text */}
                  {showCategory && categoryOpen ? (
                    <UploadCategoriesSelector
                      categories={categories}
                      allCategories={allCategories}
                      categoryQuery={categoryQuery}
                      setCategoryQuery={setCategoryQuery}
                      open={categoryOpen}
                      setOpen={(v) => {
                        setCategoryOpen(v);
                        if (!v) setShowCategory(false);
                      }}
                      min={CATEGORIES_MIN}
                      max={CATEGORIES_MAX}
                      onAdd={(name) => {
                        addCategory(name);
                        // auto-close picker after adding
                        setCategoryOpen(false);
                        setShowCategory(false);
                      }}
                      onRemove={removeCategory}
                      type="feed"
                      hidePills
                      hideHeader
                      placeholder="Add category"
                    />
                  ) : (
                    categories.length < CATEGORIES_MAX && (
                      <TouchableOpacity
                        onPress={handleToggleCategory}
                        activeOpacity={0.7}
                        className="flex-row items-center"
                      >
                        <Ionicons name="pricetag-outline" size={18} color="#6F7174" />
                        <Text className="text-theme-neutrals-400 text-sm ml-1.5">
                          Add categories
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
        </Pressable>
      </ScrollView>

      {/* ── Monetization slide-up panel (animated) ── */}
      <Animated.View style={monetizationAnimStyle}>
        <MonetizationPanel
          state={monetization}
          onChange={handleMonetizationChange}
          autoExpandSection={autoExpandSection}
          onAutoExpandHandled={handleAutoExpandHandled}
        />
      </Animated.View>

      {/* ── Divider ─────────────────────────────────── */}
      <View className="h-px bg-theme-neutrals-700 mx-4" />

      {/* ── Bottom toolbar (stays above keyboard) ──── */}
      <View
        className="flex-row items-center px-4 h-12"
        style={{ marginBottom: bottomPad > 0 ? bottomPad : 0 }}
      >
        <TouchableOpacity
          onPress={handlePickImage}
          disabled={imageDisabled}
          activeOpacity={0.7}
          className="mr-4"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ opacity: imageDisabled ? 0.3 : 1 }}
        >
          <Ionicons name="image-outline" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handlePickVideo}
          disabled={videoDisabled}
          activeOpacity={0.7}
          className="mr-4"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ opacity: videoDisabled ? 0.3 : 1 }}
        >
          <Ionicons name="videocam-outline" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          disabled
          activeOpacity={0.7}
          className="mr-4"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ opacity: 0.3 }}
        >
          <Ionicons name="film-outline" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          disabled
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ opacity: 0.3 }}
        >
          <Ionicons name="radio-outline" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Spacer to push monetization trigger to the right */}
        <View className="flex-1" />

        {mediaMode === "video" && (
          <View className="flex-row items-center">
            {/* Show enabled monetization icons when panel is closed */}
            {!showMonetization && monetization.ppvEnabled && (
              <TouchableOpacity
                onPress={() => openMonetizationSection("ppv")}
                activeOpacity={0.7}
                className="mr-3"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="card-outline" size={18} color="#256DFA" />
              </TouchableOpacity>
            )}
            {!showMonetization && monetization.bountyEnabled && (
              <TouchableOpacity
                onPress={() => openMonetizationSection("bounty")}
                activeOpacity={0.7}
                className="mr-3"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <FontAwesome6 name="gift" size={16} color="#256DFA" />
              </TouchableOpacity>
            )}
            {!showMonetization && monetization.tokenGatedEnabled && (
              <TouchableOpacity
                onPress={() => openMonetizationSection("tokenGated")}
                activeOpacity={0.7}
                className="mr-3"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <FontAwesome6 name="shield-halved" size={16} color="#256DFA" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={toggleMonetization}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <FontAwesome6
                name="sack-dollar"
                size={20}
                color={showMonetization ? "#256DFA" : "#fff"}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Confirm Upload Modal ────────────────────── */}
      <ConfirmUploadModal
        visible={showConfirm}
        onClose={() => {
          if (!isUploading) setShowConfirm(false);
        }}
        onConfirm={handleConfirmUpload}
        confirmText={confirmText}
        stage={uploadStage}
        variant={monetization.bountyEnabled ? "bounty" : "default"}
        title="Confirm Upload"
      />

      {/* ── Save Draft Modal ───────────────────────── */}
      <GlassModal
        visible={showSaveDraftModal}
        onClose={() => setShowSaveDraftModal(false)}
        presentation="center"
        maxHeight="40%"
        blurIntensity={30}
      >
        <View className="p-5">
          <Text className="text-white text-lg font-bold text-center mb-2">
            Save Draft
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-4">
            Save this post as a draft to finish and post later?
          </Text>
          <View className="flex-row">
            <TouchableOpacity
              onPress={() => setShowSaveDraftModal(false)}
              activeOpacity={0.7}
              className="flex-1 px-4 py-3 rounded-full bg-theme-neutrals-800 border border-theme-neutrals-700 mr-2"
            >
              <Text className="text-white text-center font-medium">Cancel</Text>
            </TouchableOpacity>
            <AccentButtonGradient style={{ flex: 1, borderRadius: 9999 }}>
              <TouchableOpacity
                onPress={handleConfirmSaveDraft}
                activeOpacity={0.7}
                className="px-4 py-3"
                style={{ backgroundColor: 'transparent' }}
              >
                <Text className="text-white text-center font-semibold">Save</Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          </View>
        </View>
      </GlassModal>

      {/* ── Discard Warning Modal ──────────────────── */}
      <GlassModal
        visible={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        presentation="center"
        maxHeight="45%"
        blurIntensity={30}
        dismissible={false}
      >
        <View className="p-5">
          <Text className="text-white text-lg font-bold text-center mb-2">
            Discard Post?
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-4">
            Your post will be lost. Would you like to save it as a draft instead?
          </Text>
          <View className="gap-3">
            <AccentButtonGradient style={{ width: '100%', borderRadius: 9999 }}>
              <TouchableOpacity
                onPress={handleDiscardSaveDraft}
                activeOpacity={0.7}
                className="px-4 py-3"
                style={{ backgroundColor: 'transparent' }}
              >
                <Text className="text-white text-center font-semibold">Save to Drafts</Text>
              </TouchableOpacity>
            </AccentButtonGradient>
            <TouchableOpacity
              onPress={handleDiscard}
              activeOpacity={0.7}
              className="px-4 py-3 rounded-full bg-theme-neutrals-800 border border-theme-neutrals-700"
            >
              <Text className="text-red-500 text-center font-medium">Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowDiscardModal(false)}
              activeOpacity={0.7}
              className="px-4 py-2"
            >
              <Text className="text-theme-neutrals-400 text-center text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    </View>
  );
}
