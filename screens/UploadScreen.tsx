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
import { useNavigation, useRoute, CommonActions, useFocusEffect } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import Icon from "../components/ui/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
  runWithPermissions,
} from "../libs/permissions.util";
import { openCroppedImagePicker, getFileName, guessMime } from "../libs/assets.util";
import { getCategoriesCached } from "../services/nft.service";
import { toastError, toastSuccess } from "../libs/toast";
import { requestAudioFocus, releaseAudioFocus } from "../libs/audioFocus";
import { useUser, useAuthActions, useProvider } from "../context/AuthContext";
import { useWeb3Provider } from "../hooks/use-web3";
import ChainSelector from "../components/common/ChainSelector";
import { isSolanaChain } from "../config/solana.constants";
import { getSolanaAddress, getSolanaMintStatus } from "../services/solana.service";
import { useKeyboard } from "../hooks/useKeyboard";
import { useMentions } from "../hooks/useMentions";
import { getAvatarUrl } from "../libs/misc";
import Avatar from "../components/common/Avatar";
import MentionSuggestions from "../components/common/MentionSuggestions";
import CategoryDrawer from "../components/Upload/CategoryDrawer";
import MonetizationPanel from "../components/Upload/MonetizationPanel";
import type { MonetizationState } from "../components/Upload/MonetizationPanel";
import CustomSwitch from "../components/ui/CustomSwitch";
import LiveSettingsPanel from "../components/Upload/LiveSettingsPanel";
import type { LiveSettingsState } from "../components/Upload/LiveSettingsPanel";
import { INITIAL_LIVE_SETTINGS } from "../components/Upload/LiveSettingsPanel";
import ConfirmUploadModal from "../components/Upload/ConfirmUploadModal";
import { useUploadPost } from "../hooks/useUploadPost";
import { useUploadLive } from "../hooks/useUploadLive";
import { usePostSound } from "../hooks/usePostSound";
import { buildSoundtrackTag } from "../libs/parseSoundtrack";
import SoundPickerSheet from "../components/Post/SoundPickerSheet";
import ScheduleSheet from "../components/Upload/ScheduleSheet";
import { useDrafts } from "../hooks/useDrafts";
import type { Draft } from "../hooks/useDrafts";
import GlassModal from "../components/ui/GlassModal";
import type { UploadPayload, UploadStage, PickedAudio } from "../hooks/useUploadPost";
import type { LiveUploadPayload } from "../hooks/useUploadLive";
import type { AppStackParamList } from "../navigation/types";
import { useStages } from "../context/StageContext";
import { ScreenNames } from "../navigation/ScreenNames";
import QuotedPostEmbed from "../components/common/QuotedPostEmbed";
import { sendAIChat } from "../services/ai.service";

const TITLE_MAX = 140;
const DESCRIPTION_MAX = 500;
const IMAGES_MAX = 4;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB per image
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_AUDIO_DURATION_MS = 60_000; // 60 seconds
const AUDIO_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/aac", "audio/ogg", "audio/x-m4a", "audio/mp4", "audio/webm"];
const CATEGORIES_MIN = 0;
const CATEGORIES_MAX = 5;
const MAX_SHORT_DURATION_MS = 90_000; // 90 seconds

type PickedAsset = ImagePicker.ImagePickerAsset;
type MediaMode = "none" | "images" | "video" | "audio";

const isPortraitVideo = (asset: PickedAsset): boolean =>
  (asset.height ?? 0) > (asset.width ?? 0);

const isShortCandidateFn = (asset: PickedAsset): boolean =>
  isPortraitVideo(asset) && (asset.duration ?? Infinity) <= MAX_SHORT_DURATION_MS;

export default function UploadScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, typeof ScreenNames.Upload>>();
  const incomingDraft = route.params?.draft as Draft | undefined;
  const incomingQuotedTokenId = route.params?.quotedTokenId;
  const incomingQuotedPost = route.params?.quotedPost as Record<string, any> | undefined;
  const authUser = useUser();
  const { switchChain } = useAuthActions();
  const { isSwitchingChain } = useProvider();
  const { chainId: activeChainId } = useWeb3Provider();
  // Post mint chain — EVM follows the active wallet chain; Solana (#41) is a local
  // override (no wallet switch) that signs via the Web3Auth ed25519 key.
  const [postChainId, setPostChainId] = useState<number | undefined>(undefined);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const effectivePostChainId = postChainId ?? activeChainId;
  const handleMintChainChange = useCallback(
    async (targetChainId: number) => {
      if (isSolanaChain(targetChainId)) {
        const addr = await getSolanaAddress();
        if (!addr) {
          toastError("Solana posting needs a social login. Sign in with a social account to continue.");
          return;
        }
        try {
          const status = await getSolanaMintStatus();
          if (status.mintingEnabled === false) {
            toastError(status.message || "Solana posting is temporarily unavailable. Try Base or BNB instead.");
            return;
          }
        } catch {
          // Status endpoint optional — don't block if it fails.
        }
        setSolanaAddress(addr);
        setPostChainId(targetChainId);
        return;
      }
      // EVM chain — switch the active wallet chain.
      setSolanaAddress(null);
      setPostChainId(targetChainId);
      if (targetChainId !== activeChainId) switchChain(targetChainId).catch(() => {});
    },
    [activeChainId, switchChain]
  );
  const insets = useSafeAreaInsets();
  const titleRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
  const { saveDraft, deleteDraft } = useDrafts(authUser?.address);

  const avatarUri = useMemo(
    () => getAvatarUrl(authUser?.avatarImageUrl),
    [authUser?.avatarImageUrl],
  );

  const [bodyText, setBodyText] = useState("");
  const bodyMentions = useMentions(bodyText, setBodyText);
  const [description, setDescription] = useState("");
  const descMentions = useMentions(description, setDescription);
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [pickedImages, setPickedImages] = useState<PickedAsset[]>([]);
  const [pickedVideo, setPickedVideo] = useState<PickedAsset | null>(null);
  const [pickedAudio, setPickedAudio] = useState<PickedAudio | null>(null);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioRecordingElapsed, setAudioRecordingElapsed] = useState(0);
  const audioRecordingRef = useRef<Audio.Recording | null>(null);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioStartTimeRef = useRef(0);
  const [audioMeterBars, setAudioMeterBars] = useState<number[]>([]);
  const audioMeterBarsRef = useRef<number[]>([]);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const audioPreviewRef = useRef<Audio.Sound | null>(null);
  const [isAudioPreviewPlaying, setIsAudioPreviewPlaying] = useState(false);

  // Stable callback for global audio focus — pauses audio preview when another source plays
  const handleStopAudioPreviewFocus = useCallback(() => {
    audioPreviewRef.current?.pauseAsync().catch(() => {});
    setIsAudioPreviewPlaying(false);
  }, []);
  const [isMuted, setIsMuted] = useState(true);
  const [showDescription, setShowDescription] = useState(false);
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

  const [isQuoteMode, setIsQuoteMode] = useState(!!incomingQuotedTokenId);
  const [quotedTokenId, setQuotedTokenId] = useState<number | string | undefined>(incomingQuotedTokenId);
  const [quotedPost, setQuotedPost] = useState<Record<string, any> | undefined>(incomingQuotedPost);

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [showLiveOptions, setShowLiveOptions] = useState(false);
  const [liveSettings, setLiveSettings] = useState<LiveSettingsState>(INITIAL_LIVE_SETTINGS);
  const [showLiveSettings, setShowLiveSettings] = useState(false);
  const [liveThumbnailUri, setLiveThumbnailUri] = useState<string | null>(null);

  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDurationHours, setPollDurationHours] = useState(24);
  const [pollIsMultiple, setPollIsMultiple] = useState(false);

  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isEnhancingDesc, setIsEnhancingDesc] = useState(false);
  /** Track the draft id if we're editing one (so we can delete on save/post) */
  const restoredDraftIdRef = useRef<string | null>(null);

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

  const liveSettingsProgress = useSharedValue(0);

  useEffect(() => {
    liveSettingsProgress.value = withTiming(showLiveSettings ? 1 : 0, {
      duration: 250,
    });
  }, [showLiveSettings, liveSettingsProgress]);

  const liveSettingsAnimStyle = useAnimatedStyle(() => ({
    opacity: liveSettingsProgress.value,
    maxHeight: liveSettingsProgress.value * 500,
    overflow: "hidden" as const,
  }));

  const mediaMode: MediaMode = useMemo(() => {
    if (pickedVideo) return "video";
    if (pickedAudio) return "audio";
    if (pickedImages.length > 0) return "images";
    return "none";
  }, [pickedVideo, pickedAudio, pickedImages.length]);

  const isShortCandidate = useMemo(
    () => !!pickedVideo && isShortCandidateFn(pickedVideo),
    [pickedVideo],
  );

  const [postAsShort, setPostAsShort] = useState(false);

  // Auto-set toggle when video changes
  useEffect(() => {
    setPostAsShort(!!pickedVideo && isShortCandidateFn(pickedVideo));
  }, [pickedVideo]);

  useEffect(() => {
    if (postAsShort) setShowMonetization(false);
  }, [postAsShort]);

  const hasMedia = mediaMode !== "none";
  const pollIsValid = pollEnabled && pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2;
  const hasContent = bodyText.trim().length > 0 || hasMedia || isQuoteMode || pollIsValid;
  const canPost = !isLiveMode && (bodyText.trim().length > 0 || hasMedia || isQuoteMode || pollIsValid);
  const canGoLive = isLiveMode && bodyText.trim().length > 0 && !!(liveThumbnailUri || coverUri);

  // Show description/category area when user has typed or picked media
  // Once opened, they stay even if title is cleared (to preserve filled data)
  const showExtras = isLiveMode || hasContent || showDescription
    || description.length > 0 || categories.length > 0;

  // image button disabled when: video/audio selected OR 4 images already OR recording
  const imageDisabled = mediaMode === "video" || mediaMode === "audio" || pickedImages.length >= IMAGES_MAX || isAudioRecording;
  // video button disabled when: any media is selected OR recording
  const videoDisabled = hasMedia || isAudioRecording;
  // audio button disabled when: any media is selected (but not during recording — that's the audio button's own mode)
  const audioDisabled = hasMedia;
  // live button disabled when media is already selected OR recording
  const liveDisabled = hasMedia || isAudioRecording;

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

  useEffect(() => {
    if (!incomingDraft) return;
    restoredDraftIdRef.current = incomingDraft.id;
    setBodyText(incomingDraft.bodyText);
    setDescription(incomingDraft.description);
    setCategories(incomingDraft.categories);
    if (incomingDraft.description.length > 0) setShowDescription(true);
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
    },
    [categories],
  );

  const removeCategory = useCallback((name: string) => {
    setCategories((prev) =>
      prev.filter((c) => c.toLowerCase() !== name.toLowerCase()),
    );
  }, []);

  const formHasContent = useMemo(
    () =>
      bodyText.trim().length > 0 ||
      description.trim().length > 0 ||
      categories.length > 0 ||
      pickedImages.length > 0 ||
      !!pickedVideo ||
      !!pickedAudio ||
      !!liveThumbnailUri ||
      isLiveMode ||
      pollEnabled,
    [bodyText, description, categories, pickedImages, pickedVideo, pickedAudio, liveThumbnailUri, isLiveMode, pollEnabled],
  );

  /** Close handler – placed before useUploadPost; isUploading guard is in the X button's disabled prop */
  const handleClose = useCallback(() => {
    if (formHasContent) {
      setShowDiscardModal(true);
    } else {
      nav.goBack();
    }
  }, [nav, formHasContent]);

  const handleEnhanceText = useCallback(async () => {
    const text = bodyText.trim();
    if (!text || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const res = await sendAIChat({
        messages: [
          {
            role: "user",
            content: `Enhance this social media post text. Make it more engaging, add relevant emojis, and keep it concise. Only return the enhanced text, nothing else:\n\n${text}`,
          },
        ],
        isAuthenticated: !!authUser,
      });
      if (res.response) {
        const enhanced = res.response.trim().slice(0, TITLE_MAX);
        setBodyText(enhanced);
      }
    } catch (e: any) {
      toastError(e?.message || "Failed to enhance text");
    } finally {
      setIsEnhancing(false);
    }
  }, [bodyText, isEnhancing, authUser]);

  const handleEnhanceDescription = useCallback(async () => {
    const text = description.trim();
    if (!text || isEnhancingDesc) return;
    setIsEnhancingDesc(true);
    try {
      const res = await sendAIChat({
        messages: [
          {
            role: "user",
            content: `Enhance this social media post description. Make it more detailed and engaging, add relevant emojis, and keep it natural. Only return the enhanced text, nothing else:\n\n${text}`,
          },
        ],
        isAuthenticated: !!authUser,
      });
      if (res.response) {
        const enhanced = res.response.trim().slice(0, DESCRIPTION_MAX);
        setDescription(enhanced);
      }
    } catch (e: any) {
      toastError(e?.message || "Failed to enhance description");
    } finally {
      setIsEnhancingDesc(false);
    }
  }, [description, isEnhancingDesc, authUser]);

  const handleBodyChange = useCallback((text: string) => {
    if (text.length <= TITLE_MAX) bodyMentions.handleChangeText(text);
  }, [bodyMentions]);

  const handleDescriptionChange = useCallback((text: string) => {
    if (text.length <= DESCRIPTION_MAX) descMentions.handleChangeText(text);
  }, [descMentions]);

  const {
    validate,
    preUploadCheck,
    buildConfirmText,
    upload,
    uploadStage,
    isUploading,
    enqueueJob,
    enqueueQuoteJob,
  } = useUploadPost();

  const {
    validate: validateLive,
    buildConfirmText: buildLiveConfirmText,
    upload: uploadLive,
    uploadStage: liveUploadStage,
    isUploading: isLiveUploading,
  } = useUploadLive();

  const { attachedSound, selectSound, clearSound } = usePostSound();
  const { openModal: openStages } = useStages();
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);

  const soundtrackEnabled =
    !isLiveMode && !isQuoteMode && !postAsShort && (mediaMode === "video" || mediaMode === "images");

  // Regular and quote uploads are now background-queued (not blocking).
  // Only live mode blocks the screen.
  const activeIsUploading = isLiveMode ? isLiveUploading : false;
  const activeUploadStage = isLiveMode ? liveUploadStage : "idle" as UploadStage;

  // Intercept Android back button (placed after useUploadPost for isUploading)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activeIsUploading) return true; // prevent closing during upload
      if (formHasContent) {
        setShowDiscardModal(true);
        return true;
      }
      return false; // let default back happen
    });
    return () => sub.remove();
  }, [formHasContent, activeIsUploading]);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const getPayload = useCallback((): UploadPayload => {
    // For non-video posts the "title" input IS the description on the backend.
    // Send empty bodyText (name) so only description is populated.
    // Videos keep separate title (name) + description.
    const isVideo = !!pickedVideo;
    const soundTag = attachedSound ? buildSoundtrackTag(attachedSound) : "";
    const desc = isVideo ? description : bodyText;
    const descWithSound = soundTag ? `${soundTag}\n${desc}`.trim() : desc;
    return {
      bodyText: isVideo ? bodyText : "",
      description: descWithSound,
      categories,
      pickedImages,
      pickedVideo,
      pickedAudio,
      thumbnailUri,
      coverUri,
      monetization,
      postAsShort,
      attachedSound: attachedSound || undefined,
      pollData: pollIsValid ? {
        question: pollQuestion.trim(),
        options: pollOptions.filter(o => o.trim()).map(o => o.trim()),
        expiresAt: new Date(Date.now() + pollDurationHours * 3600 * 1000).toISOString(),
        isMultipleChoice: pollIsMultiple,
      } : undefined,
      scheduledAt: scheduledDate ?? undefined,
      postChainId: effectivePostChainId,
      solanaAddress: solanaAddress ?? undefined,
    };
  }, [bodyText, description, categories, pickedImages, pickedVideo, pickedAudio, thumbnailUri, coverUri, monetization, postAsShort, attachedSound, pollIsValid, pollQuestion, pollOptions, pollDurationHours, pollIsMultiple, scheduledDate, effectivePostChainId, solanaAddress]);

  const handleTogglePoll = useCallback(() => {
    if (pollEnabled) {
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollDurationHours(24);
      setPollIsMultiple(false);
    }
    setPollEnabled((prev) => !prev);
  }, [pollEnabled]);

  const handleToggleLiveMode = useCallback(() => {
    setIsLiveMode((prev) => {
      const next = !prev;
      if (next) {
        // Entering live mode: clear media, hide monetization
        setPickedVideo(null);
        setPickedImages([]);
        setPickedAudio(null);
        setShowMonetization(false);
        setThumbnailUri(null);
        setCoverUri(null);
        setCoverHidden(false);
        clearSound();
      } else {
        // Leaving live mode: clear live-specific state
        setShowLiveSettings(false);
        setLiveThumbnailUri(null);
        setLiveSettings(INITIAL_LIVE_SETTINGS);
      }
      return next;
    });
  }, []);

  const handlePickLiveThumbnail = useCallback(async () => {
    try {
      await runWithPermissions(["photos"], async () => {
        const picked = await openCroppedImagePicker({
          width: 640,
          height: 360,
          quality: 0.9,
          forceJpg: true,
        });
        if (picked) {
          setLiveThumbnailUri(picked);
        }
      });
    } catch (err) {
      console.error("[UploadScreen] live thumbnail pick error:", err);
    }
  }, []);

  const getLivePayload = useCallback((): LiveUploadPayload => ({
    title: bodyText,
    description,
    categories,
    thumbnailUri: liveThumbnailUri,
    coverUri: null,
    settings: liveSettings,
  }), [bodyText, description, categories, liveThumbnailUri, liveSettings]);

  const handleGoLive = useCallback(() => {
    if (!canGoLive || activeIsUploading) return;
    const payload = getLivePayload();

    const validation = validateLive(payload);
    if (!validation.valid) {
      toastError(validation.error ?? "Please fill in required fields.");
      return;
    }

    const text = buildLiveConfirmText(payload);
    setConfirmText(text);
    setShowConfirm(true);
  }, [canGoLive, activeIsUploading, getLivePayload, validateLive, buildLiveConfirmText]);

  const handleConfirmGoLive = useCallback(async () => {
    const payload = getLivePayload();
    await uploadLive(payload);
  }, [getLivePayload, uploadLive]);

  const handleLiveSettingsChange = useCallback((next: LiveSettingsState) => {
    setLiveSettings(next);
  }, []);

  const toggleLiveSettings = useCallback(() => {
    setShowLiveSettings((prev) => !prev);
  }, []);

  const handlePost = useCallback(() => {
    if (activeIsUploading) return;
    if (isLiveMode) {
      handleGoLive();
      return;
    }
    if (!canPost) return;

    // Quote mode: simpler validation, skip monetization checks
    if (isQuoteMode) {
      if (bodyText.trim().length === 0 && !pickedVideo && !pickedAudio && pickedImages.length === 0) {
        toastError("Write something or add media to quote this post.");
        return;
      }
      setConfirmText(
        "This quote post is on-chain and cannot be edited or deleted once posted. Please make sure everything is correct before proceeding."
      );
      setShowConfirm(true);
      return;
    }

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
  }, [canPost, activeIsUploading, isLiveMode, isQuoteMode, bodyText, pickedVideo, pickedAudio, pickedImages, getPayload, validate, preUploadCheck, buildConfirmText, handleGoLive]);

  const navigateHome = useCallback(() => {
    nav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: ScreenNames.Root, params: { screen: ScreenNames.Home } }],
      }),
    );
  }, [nav]);

  const handleConfirmUpload = useCallback(async () => {
    let payload = getPayload();

    if (isSolanaChain(payload.postChainId)) {
      const addr = payload.solanaAddress ?? (await getSolanaAddress().catch(() => null));
      if (!addr) {
        toastError("Solana posting needs a social login. Sign in with a social account to continue.");
        return;
      }
      payload = { ...payload, solanaAddress: addr };
      if (!solanaAddress) setSolanaAddress(addr);
    }

    const ok = enqueueJob(payload);
    if (!ok) return;
    setShowConfirm(false);
    setTimeout(navigateHome, 120);
  }, [getPayload, enqueueJob, navigateHome, solanaAddress]);

  const handleRemoveQuoteEmbed = useCallback(() => {
    setIsQuoteMode(false);
    setQuotedTokenId(undefined);
    setQuotedPost(undefined);
  }, []);

  const handleConfirmQuoteUpload = useCallback(() => {
    if (!quotedTokenId) return;
    const ok = enqueueQuoteJob({
      bodyText: bodyText.trim(),
      description: description.trim(),
      categories,
      pickedVideo,
      pickedImages,
      pickedAudio,
      coverUri,
      thumbnailUri,
      quotedTokenId: Number(quotedTokenId),
    });
    if (!ok) return;
    setShowConfirm(false);
    setTimeout(navigateHome, 120);
  }, [
    quotedTokenId, categories, pickedVideo, bodyText, description,
    coverUri, thumbnailUri, pickedImages, pickedAudio, enqueueQuoteJob, navigateHome,
  ]);

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
      await runWithPermissions(["photos"], async () => {
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
      });
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
      await runWithPermissions(["photos"], async () => {
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
      await runWithPermissions(["photos"], async () => {
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
      });
    } catch (err) {
      console.error("[UploadScreen] video pick error:", err);
    }
  }, [videoDisabled, generateThumbnail]);

  const handleChangeVideo = useCallback(async () => {
    try {
      await runWithPermissions(["photos"], async () => {
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
      });
    } catch (err) {
      console.error("[UploadScreen] video change error:", err);
    }
  }, [generateThumbnail]);

  const handleRemoveImage = useCallback((index: number) => {
    setPickedImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) clearSound();
      return next;
    });
  }, [clearSound]);

  const handleRemoveVideo = useCallback(() => {
    setPickedVideo(null);
    setIsMuted(true);
    setShowMonetization(false);
    setThumbnailUri(null);
    setCoverUri(null);
    setCoverHidden(false);
    clearSound();
  }, [clearSound]);

  /* ── Audio handlers ─────────────────────────────────────────── */
  const handleRemoveAudio = useCallback(async () => {
    // Stop preview if playing
    if (audioPreviewRef.current) {
      try { await audioPreviewRef.current.unloadAsync(); } catch {}
      audioPreviewRef.current = null;
      setIsAudioPreviewPlaying(false);
    }
    setPickedAudio(null);
  }, []);

  const fmtRecordTime = useCallback((ms: number): string => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }, []);

  const handleStartAudioRecording = useCallback(async () => {
    setShowAudioMenu(false);
    try {
      let micGranted = false;
      await runWithPermissions(["microphone"], async () => {
        micGranted = true;
      });
      if (!micGranted) {
        toastError("Microphone permission is required to record audio.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      audioRecordingRef.current = recording;
      setIsAudioRecording(true);
      setAudioRecordingElapsed(0);
      setAudioMeterBars([]);
      audioMeterBarsRef.current = [];
      audioStartTimeRef.current = Date.now();

      audioTimerRef.current = setInterval(async () => {
        const elapsed = Date.now() - audioStartTimeRef.current;
        setAudioRecordingElapsed(elapsed);
        if (elapsed >= MAX_AUDIO_DURATION_MS) {
          handleStopAudioRecording();
          return;
        }
        // Metering for waveform
        try {
          const rec = audioRecordingRef.current;
          let level = 0.08 + Math.random() * 0.12;
          if (rec) {
            const st = await rec.getStatusAsync();
            const dB = (st as any).metering;
            if (dB != null && dB > -160) {
              level = Math.max(0.05, Math.min(1, (dB + 40) / 40));
            }
          }
          const bars = audioMeterBarsRef.current;
          bars.push(level);
          if (bars.length > 35) bars.shift();
          audioMeterBarsRef.current = bars;
          setAudioMeterBars([...bars]);
        } catch {}
      }, 150);
    } catch (e) {
      console.error("[UploadScreen] audio recording start error:", e);
      toastError("Failed to start recording.");
    }
  }, []);

  const handleStopAudioRecording = useCallback(async () => {
    if (audioTimerRef.current) {
      clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
    }
    try {
      const rec = audioRecordingRef.current;
      if (!rec) return;
      const status = await rec.getStatusAsync();
      if (status.isRecording) await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const durationMs = status.durationMillis || audioRecordingElapsed;
      audioRecordingRef.current = null;
      setIsAudioRecording(false);
      setAudioRecordingElapsed(0);
      setAudioMeterBars([]);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (uri && durationMs > 500) {
        setPickedAudio({
          uri,
          name: "voice-recording.m4a",
          mimeType: "audio/x-m4a",
          durationMs,
        });
      }
    } catch (e) {
      console.error("[UploadScreen] audio recording stop error:", e);
      setIsAudioRecording(false);
    }
  }, [audioRecordingElapsed]);

  const handleCancelAudioRecording = useCallback(async () => {
    if (audioTimerRef.current) {
      clearInterval(audioTimerRef.current);
      audioTimerRef.current = null;
    }
    try {
      const rec = audioRecordingRef.current;
      if (rec) {
        const s = await rec.getStatusAsync();
        if (s.isRecording) await rec.stopAndUnloadAsync();
      }
    } catch {}
    audioRecordingRef.current = null;
    setIsAudioRecording(false);
    setAudioRecordingElapsed(0);
    setAudioMeterBars([]);
    Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }, []);

  const handlePickAudioFile = useCallback(async () => {
    setShowAudioMenu(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      // Check file size
      if (asset.size && asset.size > MAX_AUDIO_SIZE_BYTES) {
        toastError("Audio file exceeds 20 MB limit.");
        return;
      }

      setPickedAudio({
        uri: asset.uri,
        name: asset.name || "audio-upload",
        mimeType: asset.mimeType || "audio/mpeg",
      });
    } catch (e) {
      console.error("[UploadScreen] audio pick error:", e);
    }
  }, []);

  const handleToggleAudioPreview = useCallback(async () => {
    try {
      if (isAudioPreviewPlaying && audioPreviewRef.current) {
        await audioPreviewRef.current.pauseAsync();
        setIsAudioPreviewPlaying(false);
        releaseAudioFocus(handleStopAudioPreviewFocus);
        return;
      }

      requestAudioFocus(handleStopAudioPreviewFocus);

      if (audioPreviewRef.current) {
        const status = await audioPreviewRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.didJustFinish || status.positionMillis >= (status.durationMillis || 0)) {
            await audioPreviewRef.current.setPositionAsync(0);
          }
          await audioPreviewRef.current.playAsync();
          setIsAudioPreviewPlaying(true);
          return;
        }
      }

      if (!pickedAudio) return;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      });
      const { sound } = await Audio.Sound.createAsync(
        { uri: pickedAudio.uri },
        { shouldPlay: true },
      );
      audioPreviewRef.current = sound;
      setIsAudioPreviewPlaying(true);
      sound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded) return;
        if (s.didJustFinish) {
          setIsAudioPreviewPlaying(false);
          releaseAudioFocus(handleStopAudioPreviewFocus);
        }
      });
    } catch (e) {
      console.error("[UploadScreen] audio preview error:", e);
      releaseAudioFocus(handleStopAudioPreviewFocus);
    }
  }, [isAudioPreviewPlaying, pickedAudio]);

  // Cleanup audio recording + preview on unmount
  useEffect(() => {
    return () => {
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      const rec = audioRecordingRef.current;
      if (rec) {
        rec.stopAndUnloadAsync().catch(() => {});
        audioRecordingRef.current = null;
      }
      const preview = audioPreviewRef.current;
      if (preview) {
        preview.unloadAsync().catch(() => {});
        audioPreviewRef.current = null;
      }
    };
  }, []);

  // Stop audio preview + recording when navigating away from screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (isAudioPreviewPlaying && audioPreviewRef.current) {
          audioPreviewRef.current.pauseAsync().catch(() => {});
          setIsAudioPreviewPlaying(false);
        }
        if (isAudioRecording && audioRecordingRef.current) {
          handleCancelAudioRecording();
        }
      };
    }, [isAudioPreviewPlaying, isAudioRecording, handleCancelAudioRecording])
  );

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

  const openCategoryDrawer = useCallback(() => {
    setCategoryOpen(true);
  }, []);

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

  const bottomPad = kbVisible ? kbHeight : insets.bottom;

  return (
    <View className="flex-1 bg-black">{/* don't add top inset */}
      <View className="flex-row items-center justify-between px-4 h-14">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="X" size={26} color="#fff" />
          </TouchableOpacity>

          <ChainSelector
            selectedChainId={effectivePostChainId}
            onChange={handleMintChainChange}
            variant="compact"
            disabled={activeIsUploading || isSwitchingChain}
            title="Mint on network"
            includeSolana
          />
        </View>

        <View className="flex-row items-center">
          {formHasContent && !activeIsUploading && (
            <TouchableOpacity
              onPress={handleDraftButton}
              activeOpacity={0.7}
              className="mr-3 w-9 h-9 rounded-full bg-white/10 items-center justify-center border border-white/20"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Save draft"
            >
              <Icon name="Save" size={16} color="#fff" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handlePost}
            disabled={isLiveMode ? (!canGoLive || activeIsUploading) : (!canPost || activeIsUploading)}
            activeOpacity={0.8}
            className="h-10 px-5 rounded-full items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={isLiveMode ? "Go live" : "Post"}
            style={{
              backgroundColor: (isLiveMode ? canGoLive : canPost) ? '#fff' : 'rgba(255,255,255,0.1)',
            }}
          >
            {activeIsUploading ? (
              <ActivityIndicator size="small" color={(isLiveMode ? canGoLive : canPost) ? '#000' : '#6F7174'} />
            ) : (
              <Icon
                name={isLiveMode ? "Radio" : "Send"}
                size={18}
                color={(isLiveMode ? canGoLive : canPost) ? '#000' : '#6F7174'}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {scheduledDate && (
        <View
          className="mx-4 mb-2 flex-row items-center px-3 py-2 rounded-xl"
          style={{ backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}
        >
          <TouchableOpacity
            onPress={() => setShowScheduleSheet(true)}
            activeOpacity={0.7}
            className="flex-row items-center flex-1"
          >
            <Icon name="Clock" size={14} color="#fff" />
            <Text className="text-theme-neutrals-200 text-xs font-medium ml-2">
              Scheduled for{" "}
              {scheduledDate.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setScheduledDate(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Remove schedule"
          >
            <Icon name="X" size={14} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable className="flex-1">
        <View className="flex-row px-4 pt-2">
          <View className="pt-1 mr-3">
            <Avatar
              uri={
                avatarUri && avatarUri !== "default-avatar"
                  ? avatarUri
                  : undefined
              }
              size={40}
              rounded
              name={authUser?.displayName}
            />
          </View>

          <View className="flex-1">
            <TextInput
              ref={titleRef}
              value={bodyText}
              onChangeText={handleBodyChange}
              onSelectionChange={bodyMentions.handleSelectionChange}
              placeholder={isQuoteMode ? "Add a comment…" : "What's happening?"}
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

            <MentionSuggestions
              visible={bodyMentions.showSuggestions}
              suggestions={bodyMentions.suggestions}
              onSelect={bodyMentions.selectMention}
              loading={bodyMentions.loading}
            />

            <View className="flex-row items-center justify-between mt-1">
              <TouchableOpacity
                onPress={handleEnhanceText}
                disabled={!bodyText.trim() || isEnhancing}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ opacity: !bodyText.trim() || isEnhancing ? 0.3 : 1 }}
              >
                {isEnhancing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="Sparkles" size={16} color="#fff" />
                )}
              </TouchableOpacity>
              <Text
                className={`text-xs ${
                  bodyText.length >= TITLE_MAX
                    ? "text-theme-red-500"
                    : "text-theme-neutrals-500"
                }`}
              >
                {bodyText.length}/{TITLE_MAX}
              </Text>
            </View>

            {isLiveMode && (
              <View className="mt-2 flex-row items-center">
                <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
                <Text className="text-red-400 text-xs font-semibold uppercase tracking-wide">
                  Livestream Mode
                </Text>
              </View>
            )}

            {isLiveMode && (
              <View className="mt-3">
                {liveThumbnailUri ? (
                  <View className="w-full rounded-xl overflow-hidden border border-theme-neutrals-700 relative"
                    style={{ aspectRatio: 16 / 9 }}
                  >
                    <Image
                      source={{ uri: liveThumbnailUri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                    <View className="absolute top-2 right-2 flex-row">
                      <TouchableOpacity
                        onPress={handlePickLiveThumbnail}
                        activeOpacity={0.7}
                        className="mr-2 w-8 h-8 rounded-full bg-black/60 items-center justify-center border border-white/10"
                        accessibilityRole="button"
                        accessibilityLabel="Change thumbnail"
                      >
                        <Icon name="Pencil" size={14} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setLiveThumbnailUri(null)}
                        activeOpacity={0.7}
                        className="w-8 h-8 rounded-full bg-black/60 items-center justify-center border border-white/10"
                        accessibilityRole="button"
                        accessibilityLabel="Remove thumbnail"
                      >
                        <Icon name="Trash2" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handlePickLiveThumbnail}
                    className="h-32 rounded-xl border border-dashed border-theme-neutrals-700 bg-theme-neutrals-800 items-center justify-center"
                  >
                    <Icon name="Image" size={28} color="#A1A1AA" />
                    <Text className="text-theme-neutrals-400 text-xs mt-2">
                      Add Thumbnail <Text className="text-red-500">*</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {!isLiveMode && mediaMode === "images" && attachedSound && (
              <View className="mt-3 bg-white/5 rounded-lg px-3 py-2 flex-row items-center">
                <Icon name="Music" size={14} color="#A1A1AA" />
                <Text className="text-white text-xs ml-1.5 flex-1" numberOfLines={1}>
                  {attachedSound.title} — {attachedSound.creator}
                </Text>
                <TouchableOpacity
                  onPress={clearSound}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove sound"
                >
                  <Icon name="X" size={12} color="#A1A1AA" />
                </TouchableOpacity>
              </View>
            )}

            {!isLiveMode && mediaMode === "images" && (
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
                        accessibilityRole="button"
                        accessibilityLabel="Remove image"
                      >
                        <Icon name="X" size={16} color="#fff" />
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
                      <Icon name="Plus" size={28} color="#6F7174" />
                      <Text className="text-theme-neutrals-500 text-xs mt-1">
                        Add more
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {!isLiveMode && mediaMode === "video" && pickedVideo && (
              <View className="mt-3 rounded-xl overflow-hidden border border-theme-neutrals-700 relative">
                <VideoView
                  player={player}
                  style={{ width: "100%", height: 220, backgroundColor: "#111" }}
                  contentFit="contain"
                  nativeControls={false}
                />
                {attachedSound && (
                  <View className="absolute top-2 left-2 bg-black/70 rounded-lg px-3 py-1.5 flex-row items-center z-20">
                    <Icon name="Music" size={14} color="#A1A1AA" />
                    <Text className="text-white text-xs ml-1.5" numberOfLines={1} style={{ maxWidth: 160 }}>
                      {attachedSound.title}
                    </Text>
                    <TouchableOpacity
                      onPress={clearSound}
                      className="ml-2"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="Remove sound"
                    >
                      <Icon name="X" size={12} color="#A1A1AA" />
                    </TouchableOpacity>
                  </View>
                )}
                <View className="absolute inset-0 items-center justify-center">
                  <TouchableOpacity
                    onPress={handleTogglePlay}
                    className="w-12 h-12 rounded-full bg-black/50 items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
                  >
                    <Icon
                      name={isPlaying ? "Pause" : "Play"}
                      size={24}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={handleToggleMute}
                  className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-black/60 items-center justify-center"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={isMuted ? "Unmute video" : "Mute video"}
                >
                  <Icon
                    name={isMuted ? "VolumeX" : "Volume2"}
                    size={16}
                    color="#fff"
                  />
                </TouchableOpacity>
                {postAsShort && (
                  <View className="absolute top-2 left-2 bg-white/20 rounded px-2.5 py-0.5 flex-row items-center">
                    <Icon name="Film" size={12} color="#fff" />
                    <Text className="text-white text-xs font-semibold ml-1">Short</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={handleRemoveVideo}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 items-center justify-center"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove video"
                >
                  <Icon name="X" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleChangeVideo}
                  className="absolute top-2 right-12 w-8 h-8 rounded-full bg-black/70 items-center justify-center"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Change video"
                >
                  <Icon name="Pencil" size={16} color="#fff" />
                </TouchableOpacity>
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
                      <View className="absolute inset-0 bg-black/40 items-center justify-center">
                        <Icon name="Pencil" size={20} color="#fff" />
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={toggleCoverHidden}
                      className="absolute -top-2 right-1 w-5 h-5 rounded-full bg-black/70 items-center justify-center"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel="Hide cover"
                    >
                      <Icon name="EyeOff" size={11} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {!isLiveMode && mediaMode === "video" && coverHidden && (thumbnailUri || coverUri) && (
              <TouchableOpacity
                onPress={toggleCoverHidden}
                activeOpacity={0.7}
                className="mt-2 flex-row items-center self-end"
              >
                <Icon name="Eye" size={14} color="#6F7174" />
                <Text className="text-theme-neutrals-400 text-xs ml-1">
                  Show cover
                </Text>
              </TouchableOpacity>
            )}

            {isShortCandidate && (
              <View className="mt-3 rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-3">
                    <Icon name="Film" size={16} color="#fff" />
                    <Text className="text-white text-sm font-medium ml-2">
                      Post as Short
                    </Text>
                  </View>
                  <CustomSwitch
                    value={postAsShort}
                    onValueChange={setPostAsShort}
                  />
                </View>
                {postAsShort && (
                  <Text className="text-theme-neutrals-500 text-xs mt-1.5">
                    Thumbnail is optional — one will be auto-generated.
                  </Text>
                )}
                {!postAsShort && (
                  <Text className="text-theme-neutrals-500 text-xs mt-1.5">
                    Will be posted as a normal video.
                  </Text>
                )}
              </View>
            )}

            {isAudioRecording && (
              <View className="mt-3 rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 p-4">
                <View className="flex-row items-center">
                  <View className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2" />
                  <Text
                    className="text-white text-sm font-medium mr-3"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {fmtRecordTime(audioRecordingElapsed)}
                  </Text>
                  <Text className="text-theme-neutrals-500 text-xs mr-1">
                    Max 60s
                  </Text>

                  <TouchableOpacity
                    onPress={handleCancelAudioRecording}
                    activeOpacity={0.7}
                    className="w-9 h-9 rounded-full bg-theme-neutrals-700 items-center justify-center mr-2 ml-auto"
                    accessibilityRole="button"
                    accessibilityLabel="Discard recording"
                  >
                    <Icon name="Trash2" size={18} color="#EF4444" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleStopAudioRecording}
                    activeOpacity={0.7}
                    className="w-9 h-9 rounded-full bg-white items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel="Finish recording"
                  >
                    <Icon name="Check" size={20} color="#000" />
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-end mt-3" style={{ height: 24 }}>
                  {(() => {
                    const BARS = 35;
                    const display = audioMeterBars.length >= BARS
                      ? audioMeterBars.slice(-BARS)
                      : [...Array(BARS - audioMeterBars.length).fill(0.05), ...audioMeterBars];
                    return display.map((level: number, i: number) => (
                      <View
                        key={i}
                        style={{
                          width: 2.5,
                          height: Math.max(3, level * 22),
                          borderRadius: 1.25,
                          marginRight: i < BARS - 1 ? 1.5 : 0,
                          backgroundColor: "rgba(239,68,68,0.8)",
                        }}
                      />
                    ));
                  })()}
                </View>

                <View className="h-1 bg-theme-neutrals-700 rounded-full mt-3 overflow-hidden">
                  <View
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${Math.min(100, (audioRecordingElapsed / MAX_AUDIO_DURATION_MS) * 100)}%` }}
                  />
                </View>
              </View>
            )}

            {!isLiveMode && mediaMode === "audio" && pickedAudio && !isAudioRecording && (
              <View className="mt-3 rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 p-4">
                <View className="flex-row items-center">
                  <TouchableOpacity
                    onPress={handleToggleAudioPreview}
                    activeOpacity={0.7}
                    className="w-10 h-10 rounded-full bg-theme-neutrals-700 items-center justify-center mr-3"
                  >
                    <Icon
                      name={isAudioPreviewPlaying ? "Pause" : "Play"}
                      size={20}
                      color="#fff"
                    />
                  </TouchableOpacity>
                  <View className="flex-1">
                    <Text className="text-white text-sm font-medium" numberOfLines={1}>
                      {pickedAudio.name}
                    </Text>
                    {pickedAudio.durationMs != null && (
                      <Text className="text-theme-neutrals-400 text-xs mt-0.5">
                        {fmtRecordTime(pickedAudio.durationMs)}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={handleRemoveAudio}
                    className="w-8 h-8 rounded-full bg-black/60 items-center justify-center"
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove audio"
                  >
                    <Icon name="X" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {isQuoteMode && quotedPost && (
              <View className="mt-3 relative">
                <QuotedPostEmbed
                  quotedPost={quotedPost}
                  quotedTokenId={quotedTokenId}
                />
                <TouchableOpacity
                  onPress={handleRemoveQuoteEmbed}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 items-center justify-center z-10"
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel="Remove quoted post"
                >
                  <Icon name="X" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {pollEnabled && (
              <View className="mt-3 rounded-xl bg-theme-neutrals-800 border border-theme-neutrals-700 p-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-white font-semibold text-sm">Poll</Text>
                  <TouchableOpacity onPress={handleTogglePoll} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Icon name="X" size={16} color="#6F7174" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="Ask a question..."
                  placeholderTextColor="#6F7174"
                  maxLength={200}
                  className="bg-black/30 rounded-xl px-3 py-2.5 text-white text-sm mb-3"
                />

                {pollOptions.map((opt, idx) => (
                  <View key={idx} className="flex-row items-center mb-2">
                    <View className="flex-1 flex-row items-center bg-black/30 rounded-xl px-3 py-2.5">
                      <Text className="text-theme-neutrals-500 text-xs w-4">{idx + 1}</Text>
                      <TextInput
                        value={opt}
                        onChangeText={(t) => {
                          const next = [...pollOptions];
                          next[idx] = t;
                          setPollOptions(next);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        placeholderTextColor="#6F7174"
                        maxLength={60}
                        className="flex-1 text-white text-sm ml-2"
                      />
                    </View>
                    {pollOptions.length > 2 && (
                      <TouchableOpacity
                        onPress={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                        className="ml-2"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Icon name="X" size={14} color="#6F7174" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {pollOptions.length < 4 && (
                  <TouchableOpacity
                    onPress={() => setPollOptions((prev) => [...prev, ""])}
                    className="flex-row items-center px-3 py-2.5 rounded-xl border border-dashed border-theme-neutrals-600 mb-3"
                  >
                    <Icon name="Plus" size={14} color="#6F7174" />
                    <Text className="text-theme-neutrals-500 text-sm ml-2">Add option</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setPollIsMultiple((p) => !p)}
                  className="flex-row items-center mb-3"
                >
                  <View
                    className={`w-5 h-5 rounded items-center justify-center border ${
                      pollIsMultiple ? "bg-white border-white" : "border-theme-neutrals-500"
                    }`}
                  >
                    {pollIsMultiple && <Icon name="Check" size={12} color="#09090B" />}
                  </View>
                  <Text className="text-theme-neutrals-300 text-sm ml-2">Allow multiple answers</Text>
                </TouchableOpacity>

                <Text className="text-theme-neutrals-500 text-xs mb-1.5">Duration</Text>
                <View className="flex-row gap-2">
                  {[{ label: "1 day", hours: 24 }, { label: "3 days", hours: 72 }, { label: "7 days", hours: 168 }].map((d) => (
                    <TouchableOpacity
                      key={d.hours}
                      onPress={() => setPollDurationHours(d.hours)}
                      className={`px-3 py-1.5 rounded-lg ${pollDurationHours === d.hours ? "bg-white" : "bg-white/[0.06]"}`}
                    >
                      <Text className={`text-xs font-medium ${pollDurationHours === d.hours ? "text-black" : "text-theme-neutrals-400"}`}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {showExtras && (
              <View className="mt-4">
                {((mediaMode === "video" && !postAsShort) || isLiveMode) && (
                  !showDescription ? (
                    <TouchableOpacity
                      onPress={handleShowDescription}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <Icon name="FileText" size={18} color="#6F7174" />
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
                        onSelectionChange={descMentions.handleSelectionChange}
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
                      <View className="flex-row items-center justify-between mt-1">
                        <TouchableOpacity
                          onPress={handleEnhanceDescription}
                          disabled={!description.trim() || isEnhancingDesc}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ opacity: !description.trim() || isEnhancingDesc ? 0.3 : 1 }}
                        >
                          {isEnhancingDesc ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Icon name="Sparkles" size={16} color="#fff" />
                          )}
                        </TouchableOpacity>
                        <Text
                          className={`text-xs ${
                            description.length >= DESCRIPTION_MAX
                              ? "text-theme-red-500"
                              : "text-theme-neutrals-500"
                          }`}
                        >
                          {description.length}/{DESCRIPTION_MAX}
                        </Text>
                      </View>
                      <MentionSuggestions
                        visible={descMentions.showSuggestions}
                        suggestions={descMentions.suggestions}
                        onSelect={descMentions.selectMention}
                        loading={descMentions.loading}
                      />
                    </View>
                  )
                )}

                <View className="mt-4">
                  {categories.length > 0 && (
                    <View className="flex-row flex-wrap gap-2 mb-2">
                      {categories.map((c) => (
                        <View
                          key={c}
                          className="flex-row items-center px-2 py-1 rounded-lg bg-theme-neutrals-800 border border-theme-neutrals-700"
                        >
                          <Text className="text-white text-xs">{c.charAt(0).toUpperCase() + c.slice(1)}</Text>
                          <TouchableOpacity
                            onPress={() => removeCategory(c)}
                            className="ml-1"
                          >
                            <Icon name="CircleX" size={14} color="#6F7174" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {categories.length < CATEGORIES_MAX && (
                    <TouchableOpacity
                      onPress={openCategoryDrawer}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <Icon name="Tag" size={18} color="#6F7174" />
                      <Text className="text-theme-neutrals-400 text-sm ml-1.5">
                        Add categories
                      </Text>
                    </TouchableOpacity>
                  )}

                </View>
              </View>
            )}
          </View>
        </View>
        </Pressable>
      </ScrollView>

      {!isLiveMode && !isQuoteMode && !postAsShort && (
        <Animated.View style={monetizationAnimStyle}>
          <MonetizationPanel
            state={monetization}
            onChange={handleMonetizationChange}
            autoExpandSection={autoExpandSection}
            onAutoExpandHandled={handleAutoExpandHandled}
            postChainId={effectivePostChainId}
          />
        </Animated.View>
      )}

      {isLiveMode && (
        <Animated.View style={liveSettingsAnimStyle}>
          <LiveSettingsPanel
            state={liveSettings}
            onChange={handleLiveSettingsChange}
          />
        </Animated.View>
      )}

      <View className="h-px bg-theme-neutrals-700 mx-4" />

      <View
        className="flex-row items-center px-4 h-12"
        style={{ marginBottom: bottomPad > 0 ? bottomPad : 0 }}
      >
        {!isLiveMode && (
          <>
            <TouchableOpacity
              onPress={handlePickImage}
              disabled={imageDisabled}
              activeOpacity={0.7}
              className="mr-4"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add images"
              style={{ opacity: imageDisabled ? 0.3 : 1 }}
            >
              <Icon name="Image" size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickVideo}
              disabled={videoDisabled}
              activeOpacity={0.7}
              className="mr-4"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add video"
              style={{ opacity: videoDisabled ? 0.3 : 1 }}
            >
              <Icon name="Video" size={24} color="#fff" />
            </TouchableOpacity>

            <View className="mr-4" style={{ position: "relative", zIndex: 100 }}>
              <TouchableOpacity
                onPress={() => setShowAudioMenu((prev) => !prev)}
                disabled={audioDisabled}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Add audio"
                style={{ opacity: audioDisabled ? 0.3 : 1 }}
              >
                <Icon name="Music" size={22} color="#fff" />
              </TouchableOpacity>

              {showAudioMenu && (
                <>
                  <Pressable
                    onPress={() => setShowAudioMenu(false)}
                    style={{
                      position: "absolute",
                      top: -1000,
                      left: -1000,
                      right: -1000,
                      bottom: -1000,
                      zIndex: 98,
                    }}
                  />
                  <View
                    className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl"
                    style={{
                      position: "absolute",
                      bottom: 44,
                      left: -8,
                      zIndex: 99,
                      minWidth: 160,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.4,
                      shadowRadius: 8,
                      elevation: 8,
                    }}
                  >
                    <TouchableOpacity
                      onPress={handleStartAudioRecording}
                      activeOpacity={0.7}
                      className="flex-row items-center px-4 py-3"
                    >
                      <Icon name="Mic" size={20} color="#fff" />
                      <Text className="text-white text-sm ml-3">Record Voice</Text>
                    </TouchableOpacity>
                    <View className="h-px bg-theme-neutrals-700 mx-3" />
                    <TouchableOpacity
                      onPress={handlePickAudioFile}
                      activeOpacity={0.7}
                      className="flex-row items-center px-4 py-3"
                    >
                      <Icon name="CloudUpload" size={20} color="#fff" />
                      <Text className="text-white text-sm ml-3">Upload Audio</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* Soundtrack picker button — visible for video/image posts */}
            {soundtrackEnabled && (
              <TouchableOpacity
                onPress={() => setShowSoundPicker(true)}
                activeOpacity={0.7}
                className="mr-4"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Add soundtrack"
              >
                <Icon
                  name="Music"
                  size={22}
                  color={attachedSound ? "#fff" : "#A1A1AA"}
                />
              </TouchableOpacity>
            )}
          </>
        )}

        {!isLiveMode && !isQuoteMode && (
          <TouchableOpacity
            onPress={handleTogglePoll}
            activeOpacity={0.7}
            className="mr-4"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add poll"
          >
            <Icon name="ChartBarBig" size={22} color={pollEnabled ? "#fff" : "#A1A1AA"} />
          </TouchableOpacity>
        )}

        {!isLiveMode && !isQuoteMode && (
          <TouchableOpacity
            onPress={() => setShowScheduleSheet(true)}
            activeOpacity={0.7}
            className="mr-4"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Schedule post"
          >
            <Icon name="Clock" size={22} color={scheduledDate ? "#fff" : "#A1A1AA"} />
          </TouchableOpacity>
        )}

        {!isQuoteMode && (
          <TouchableOpacity
            onPress={() => {
              if (isLiveMode) {
                handleToggleLiveMode();
              } else if (!liveDisabled) {
                setShowLiveOptions(true);
              }
            }}
            disabled={liveDisabled && !isLiveMode}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className={isLiveMode ? "" : "mr-4"}
            accessibilityRole="button"
            accessibilityLabel={isLiveMode ? "Exit livestream mode" : "Live features"}
            style={{ opacity: liveDisabled && !isLiveMode ? 0.3 : 1 }}
          >
            <Icon
              name="Radio"
              size={24}
              color={isLiveMode ? "#EF4444" : "#fff"}
            />
          </TouchableOpacity>
        )}

        <View className="flex-1" />

        {isLiveMode && (
          <TouchableOpacity
            onPress={toggleLiveSettings}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Livestream settings"
          >
            <Icon
              name="Settings"
              size={22}
              color={showLiveSettings ? "#fff" : "#6F7174"}
            />
          </TouchableOpacity>
        )}

        {!isLiveMode && !isQuoteMode && mediaMode === "video" && !postAsShort && (
          <View className="flex-row items-center">
            {!showMonetization && monetization.ppvEnabled && (
              <TouchableOpacity
                onPress={() => openMonetizationSection("ppv")}
                activeOpacity={0.7}
                className="mr-3"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Pay-per-view settings"
              >
                <Icon name="CreditCard" size={18} color="#fff" />
              </TouchableOpacity>
            )}
            {!showMonetization && monetization.bountyEnabled && (
              <TouchableOpacity
                onPress={() => openMonetizationSection("bounty")}
                activeOpacity={0.7}
                className="mr-3"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Bounty settings"
              >
                <Icon name="Gift" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            {!showMonetization && monetization.tokenGatedEnabled && (
              <TouchableOpacity
                onPress={() => openMonetizationSection("tokenGated")}
                activeOpacity={0.7}
                className="mr-3"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Token gate settings"
              >
                <Icon name="ShieldCheck" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={toggleMonetization}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Monetization options"
            >
              <Icon
                name="DollarSign"
                size={20}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <CategoryDrawer
        visible={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        categories={categories}
        allCategories={allCategories}
        min={CATEGORIES_MIN}
        max={CATEGORIES_MAX}
        onAdd={addCategory}
        onRemove={removeCategory}
        type="feed"
      />

      <ConfirmUploadModal
        visible={showConfirm}
        onClose={() => {
          if (!activeIsUploading) setShowConfirm(false);
        }}
        onConfirm={isQuoteMode ? handleConfirmQuoteUpload : isLiveMode ? handleConfirmGoLive : handleConfirmUpload}
        confirmText={confirmText}
        stage={activeUploadStage}
        variant={!isLiveMode && !isQuoteMode && monetization.bountyEnabled ? "bounty" : "default"}
        title={isQuoteMode ? "Confirm Quote Post" : isLiveMode ? "Confirm Livestream" : "Confirm Upload"}
      />

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
            <TouchableOpacity
              onPress={handleConfirmSaveDraft}
              activeOpacity={0.7}
              className="flex-1 px-4 py-3 rounded-full bg-white"
            >
              <Text className="text-black text-center font-semibold">Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>

      <SoundPickerSheet
        visible={showSoundPicker}
        onClose={() => setShowSoundPicker(false)}
        onSelect={(sound) => {
          selectSound(sound);
          setShowSoundPicker(false);
        }}
        currentSound={attachedSound}
      />

      {/* Live options sheet — Go Live or Start Stage */}
      <GlassModal
        visible={showLiveOptions}
        onClose={() => setShowLiveOptions(false)}
        presentation="bottom"
        maxHeight="35%"
        blurIntensity={40}
      >
        <View className="p-5">
          <Text className="text-white text-base font-semibold text-center mb-4">
            Live Features
          </Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setShowLiveOptions(false);
              handleToggleLiveMode();
            }}
            className="flex-row items-center gap-3 py-4 px-4 rounded-xl mb-3"
            style={{ backgroundColor: "rgba(239,68,68,0.15)", borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" }}
          >
            <Icon name="Radio" size={22} color="#EF4444" />
            <View className="flex-1">
              <Text className="text-white font-semibold text-sm">Go Live</Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">Start a livestream</Text>
            </View>
            <Icon name="ChevronRight" size={18} color="#6F7174" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              setShowLiveOptions(false);
              openStages("browse");
            }}
            className="flex-row items-center gap-3 py-4 px-4 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}
          >
            <Icon name="Mic" size={22} color="#D4D4D8" />
            <View className="flex-1">
              <Text className="text-white font-semibold text-sm">Stages</Text>
              <Text className="text-theme-neutrals-400 text-xs mt-0.5">Join or start an audio stage</Text>
            </View>
            <Icon name="ChevronRight" size={18} color="#6F7174" />
          </TouchableOpacity>
        </View>
      </GlassModal>

      <ScheduleSheet
        visible={showScheduleSheet}
        onClose={() => setShowScheduleSheet(false)}
        scheduledDate={scheduledDate}
        onSchedule={(date) => {
          setScheduledDate(date);
        }}
      />

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
            <TouchableOpacity
              onPress={handleDiscardSaveDraft}
              activeOpacity={0.7}
              className="px-4 py-3 rounded-full bg-white"
            >
              <Text className="text-black text-center font-semibold">Save to Drafts</Text>
            </TouchableOpacity>
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
