import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { runWithPermissions } from "../../libs/permissions.util";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";
import { getCategoriesCached, minNft } from "../../services";
import { mintWithBounty, mintNftOnChain } from "../../services/mint.service";
import { getFileName, guessMime } from "../../libs/assets.util";
import { filteredStreamInfo } from "../../libs/validators.util";
import {
  supportedTokensForLockContent,
  supportedTokensForPPV,
  supportedNetworks,
} from "../../config";
import { supportedTokens, defaultChainId as DEFAULT_CHAIN_ID } from "../../config/constants";
import {
  useWeb3Provider,
  useStreamControllerContract,
  useStreamCollectionContract,
} from "../../hooks/use-web3";
import GlassModal from "../ui/GlassModal"; // still used by TrimModal
import { useVideoPlayer } from "expo-video";
import { useEvent } from "expo";
import UploadHeader from "./UploadHeader";
import BasicInfoForm from "./BasicInfoForm";
import CategoryDrawer from "./CategoryDrawer";
import UploadAssetsSection from "./UploadAssetsSection";
import MoreOptionsSection from "./MoreOptionsSection";
import TrimModal from "./TrimModal";
import {
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  useWindowDimensions,
} from "react-native";
import {
  isValidDataForMinting,
  getTotalBountyAmount,
} from "../../libs/validators.util";
import { streamInfoKeys } from "../../config/constants";
import { useUser, useAuthState, useAuthActions, useProvider } from "../../context/AuthContext";
import { toastError, toastSuccess } from "../../libs/toast";
import { parseTxError } from "../../libs/web3.util";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import ConfirmUploadModal from "./ConfirmUploadModal";

export type PickedMedia = ImagePicker.ImagePickerAsset | null;

type Props = {
  onClose: () => void;
};

export default function VideosTab({ onClose }: Props) {
  const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
  const DESCRIPTION_MAX = 500;
  const CATEGORIES_MIN = 1;
  const CATEGORIES_MAX = 5;
  const toSeconds = useCallback((v?: number | null) => {
    if (v === null || v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return n > 1000 ? Math.floor(n / 1000) : Math.floor(n);
  }, []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Optional settings
  const [lockContent, setLockContent] = useState(false);
  const [lockTokenSymbol, setLockTokenSymbol] = useState("DHB");
  const [lockNetwork, setLockNetwork] = useState("Base");
  const [lockAmount, setLockAmount] = useState("");

  const [payPerView, setPayPerView] = useState(false);
  const [ppvTokenSymbol, setPpvTokenSymbol] = useState("DHB");
  const [ppvNetwork, setPpvNetwork] = useState("Base");
  const [ppvAmount, setPpvAmount] = useState("");

  const [bounty, setBounty] = useState(false);
  const [bountyChain, setBountyChain] = useState("Base");
  const [bountyTokenSymbol, setBountyTokenSymbol] = useState("DHB");
  const [bountyFirstXViewer, setBountyFirstXViewer] = useState("");
  const [bountyFirstXComment, setBountyFirstXComment] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");

  const [media, setMedia] = useState<PickedMedia>(null);
  const [pendingAsset, setPendingAsset] = useState<PickedMedia>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  const [showTrimModal, setShowTrimModal] = useState(false);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineWidth, setTimelineWidth] = useState(0);
  const [frameUris, setFrameUris] = useState<string[]>([]);
  const [generatingFrames, setGeneratingFrames] = useState(false);
  const [playheadX, setPlayheadX] = useState(0);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showBountyApprove, setShowBountyApprove] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    | "idle"
    | "uploading"
    | "processing"
    | "awaiting-wallet"
    | "minting"
    | "finalizing"
  >("idle");

  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  void screenWidth;
  void insets;

  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const { authMethod } = useProvider();
  const tokenBalances = user?.tokenBalances;
  const { chainId } = useWeb3Provider();
  const streamController = useStreamControllerContract();
  const streamCollectionContract = useStreamCollectionContract();
  const navigation = useNavigation();

  // Derive ETH balance from auth state (used for gas checks)
  const ethBalance = useMemo(() => {
    const b: unknown = (user?.tokenBalances?.ETH ?? tokenBalances?.ETH) as any;
    const n = typeof b === "string" ? Number(b) : typeof b === "number" ? b : 0;
    return Number.isFinite(n) ? n : 0;
  }, [user?.tokenBalances?.ETH, tokenBalances?.ETH]);

  // Active chain label and filtered dropdowns tied to active chain
  const activeChainId = useMemo(() => chainId || DEFAULT_CHAIN_ID, [chainId]);
  const activeNetworkLabel = useMemo(() => {
    const n = supportedNetworks.find((n: any) => n.chainId === activeChainId);
    return (n?.label || n?.name || "").toString();
  }, [activeChainId]);
  // Keep network states synced to active chain label
  useEffect(() => {
    if (activeNetworkLabel) {
      setLockNetwork((prev) => (prev === activeNetworkLabel ? prev : activeNetworkLabel));
      setPpvNetwork((prev) => (prev === activeNetworkLabel ? prev : activeNetworkLabel));
      setBountyChain((prev) => (prev === activeNetworkLabel ? prev : activeNetworkLabel));
    }
  }, [activeNetworkLabel]);

  // Options for selects restricted by active chain
  const lockTokenDropdown = useMemo(() => {
    const list = supportedTokensForLockContent.filter((t) => t.chainId === activeChainId);
    const symbols = Array.from(new Set(list.map((t) => t.symbol)));
    return symbols.map((sym) => ({
      label: sym,
      value: sym,
      disabled: sym.toLowerCase() === "bnb",
    }));
  }, [activeChainId]);

  const ppvTokenDropdown = useMemo(() => {
    const list = supportedTokensForPPV.filter((t) => t.chainId === activeChainId);
    const symbols = Array.from(new Set(list.map((t) => t.symbol)));
    return symbols.map((sym) => ({
      label: sym,
      value: sym,
      disabled: sym.toLowerCase() === "bnb",
    }));
  }, [activeChainId]);

  const networkDropdown = useMemo(() => {
    return activeNetworkLabel
      ? [{ label: activeNetworkLabel, value: activeNetworkLabel, disabled: false }]
      : [];
  }, [activeNetworkLabel]);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });
  const timeUpdate = useEvent(player, "timeUpdate");
  const { isPlaying: playingEvt } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const lastTimeRef = useRef<number | null>(null);
  const playheadXRef = useRef(0);

  useEffect(() => {
    const next = !!playingEvt;
    if (next !== isPlaying) setIsPlaying(next);
  }, [playingEvt]);

  useEffect(() => {
    const payload: any = timeUpdate as any;
    if (!payload || typeof payload.currentTime !== "number") return;
    if (isPlaying && payload.currentTime >= endSec) {
      player.currentTime = startSec;
    }
    if (timelineWidth > 0) {
      const fullDur = toSeconds(media?.duration) ?? Math.max(1, endSec);
      const secPerPx = fullDur / Math.max(1, timelineWidth);
      const clamped = Math.max(0, Math.min(fullDur, payload.currentTime));
      const x = Math.max(0, Math.min(timelineWidth, clamped / secPerPx));
      if (Math.abs(x - playheadXRef.current) > 0.25) {
        playheadXRef.current = x;
        setPlayheadX(x);
      }
    }
    lastTimeRef.current = payload.currentTime;
  }, [
    timeUpdate,
    isPlaying,
    endSec,
    startSec,
    player,
    timelineWidth,
    media?.duration,
    toSeconds,
  ]);

  const generateThumb = useCallback(async (uri: string) => {
    try {
      const res = await VideoThumbnails.getThumbnailAsync(uri, {
        time: 0,
        quality: 0.6,
      });
      setThumbUri(res.uri);
    } catch {
      setThumbUri(null);
    }
  }, []);

  const pickVideo = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      const mediaTypesCompat: any = (ImagePicker as any).MediaType
        ? [(ImagePicker as any).MediaType.video]
        : (ImagePicker as any).MediaTypeOptions?.Videos ??
          ImagePicker.MediaTypeOptions.Videos;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaTypesCompat,
        allowsMultipleSelection: false,
        quality: 1,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        setPendingAsset(asset);
        const d = Math.max(1, toSeconds(asset.duration) ?? 1);
        setStartSec(0);
        setEndSec(d);
        setShowTrimModal(true);
      }
    });
  }, [toSeconds]);

  // Load the pending asset into the player while trimming
  useEffect(() => {
    const load = async () => {
      if (showTrimModal && pendingAsset?.uri) {
        try {
          await player.replaceAsync(pendingAsset.uri);
          player.currentTime = startSec;
          player.pause();
        } catch {}
      }
    };
    load();
    if (!showTrimModal) {
      try {
        player.pause();
      } catch {}
    }
  }, [showTrimModal, pendingAsset?.uri, player, startSec]);

  // Generate frame strip thumbnails when modal opens
  useEffect(() => {
    const gen = async () => {
      const active = pendingAsset ?? media;
      if (!showTrimModal || !active?.uri) return;
      if (generatingFrames) return;
      setGeneratingFrames(true);
      try {
        const durationSec = Math.max(1, toSeconds(active.duration) ?? 1);
        const count = 10;
        const times = Array.from({ length: count }, (_, i) =>
          Math.min(durationSec - 0.01, (i + 0.5) * (durationSec / count))
        );
        const uris: string[] = [];
        for (const t of times) {
          try {
            const res = await VideoThumbnails.getThumbnailAsync(active.uri, {
              time: Math.floor(t * 1000),
              quality: 0.6,
            });
            uris.push(res.uri);
          } catch {}
        }
        if (uris.length) setFrameUris(uris);
      } finally {
        setGeneratingFrames(false);
      }
    };
    gen();
    if (!showTrimModal) setFrameUris([]);
  }, [
    showTrimModal,
    pendingAsset?.uri,
    pendingAsset?.duration,
    media?.uri,
    media?.duration,
    toSeconds,
  ]);

  // Sync playhead with current start/end when layout changes
  useEffect(() => {
    if (timelineWidth <= 0) return;
    const fullDur = toSeconds(media?.duration) ?? Math.max(1, endSec);
    const secPerPx = fullDur / Math.max(1, timelineWidth);
    const x = startSec / secPerPx;
    playheadXRef.current = x;
    setPlayheadX(x);
  }, [timelineWidth, startSec, endSec, media?.duration, toSeconds]);

  // Handle dragging for start and end handles
  const startBaseRef = useRef(0);
  const endBaseRef = useRef(0);
  const prevStartRef = useRef(0);
  const prevEndRef = useRef(0);

  const handlePanFactory = (which: "start" | "end") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startBaseRef.current = startSec;
        endBaseRef.current = endSec;
      },
      onPanResponderMove: (
        _: GestureResponderEvent,
        g: PanResponderGestureState
      ) => {
        if (timelineWidth <= 0) return;
        const dx = g.dx;
        const fullDur =
          toSeconds((pendingAsset ?? media)?.duration) ?? Math.max(1, endSec);
        const secPerPx = fullDur / Math.max(1, timelineWidth);
        if (which === "start") {
          const newStart = Math.max(
            0,
            Math.min(
              endBaseRef.current - 0.5,
              startBaseRef.current + dx * secPerPx
            )
          );
          setStartSec(newStart);
          player.currentTime = newStart;
        } else {
          const dur = fullDur;
          const newEnd = Math.max(
            startBaseRef.current + 0.5,
            Math.min(dur, endBaseRef.current + dx * secPerPx)
          );
          setEndSec(newEnd);
        }
      },
      onPanResponderRelease: () => {},
    });

  const startPan = useRef(handlePanFactory("start")).current;
  const endPan = useRef(handlePanFactory("end")).current;

  const clearSelected = useCallback(() => {
    try {
      player.pause();
    } catch {}
    setShowTrimModal(false);
    setMedia(null);
    setThumbUri(null);
    setCoverUri(null);
    setFileSize(null);
    setFrameUris([]);
    setStartSec(0);
    setEndSec(0);
    setIsPlaying(false);
    setPendingAsset(null);
  }, [player]);

  const pickCoverImage = useCallback(async () => {
    await runWithPermissions(["photos"], async () => {
      const imageTypesCompat: any = (ImagePicker as any).MediaType
        ? [(ImagePicker as any).MediaType.image]
        : (ImagePicker as any).MediaTypeOptions?.Images ??
          ImagePicker.MediaTypeOptions.Images;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageTypesCompat,
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 1,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        setCoverUri(res.assets[0].uri);
      }
    });
  }, []);

  // Fetch categories with cache
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await getCategoriesCached();
        if (mounted) setAllCategories(data);
      } catch (e) {
        console.warn("Failed to load categories", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const addCategory = useCallback(
    (name: string) => {
      const n = name.trim();
      if (!n) return;
      if (categories.find((c) => c.toLowerCase() === n.toLowerCase())) return;
      if (categories.length >= CATEGORIES_MAX) return;
      setCategories((prev) => [...prev, n]);
    },
    [categories]
  );

  const removeCategory = useCallback((name: string) => {
    setCategories((prev) =>
      prev.filter((c) => c.toLowerCase() !== name.toLowerCase())
    );
  }, []);

  const parsePositiveNumber = useCallback((v: string): number | undefined => {
    if (!v) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    if (n <= 0) return undefined;
    return n;
  }, []);

  const isAdvancedValid = useMemo(() => {
    if (lockContent) {
      const amt = parsePositiveNumber(lockAmount);
      if (!lockTokenSymbol || !lockNetwork || !amt) return false;
    }
    if (payPerView) {
      const amt = parsePositiveNumber(ppvAmount);
      if (!ppvTokenSymbol || !ppvNetwork || !amt) return false;
    }
    if (bounty) {
      const amt = parsePositiveNumber(bountyAmount);
      const viewers = parsePositiveNumber(bountyFirstXViewer);
      const comments = parsePositiveNumber(bountyFirstXComment);
      if (!bountyTokenSymbol || !bountyChain || !amt || !viewers || !comments)
        return false;
    }
    return true;
  }, [
    lockContent,
    lockTokenSymbol,
    lockNetwork,
    lockAmount,
    payPerView,
    ppvTokenSymbol,
    ppvNetwork,
    ppvAmount,
    bounty,
    bountyTokenSymbol,
    bountyChain,
    bountyAmount,
    bountyFirstXViewer,
    bountyFirstXComment,
    parsePositiveNumber,
  ]);

  const isFormValid = useMemo(() => {
    const t = title.trim();
    const d = description.trim();
    const hasBasics =
      t.length >= 3 && d.length >= 3 && categories.length >= CATEGORIES_MIN;
    const hasMedia =
      !!media && fileSize != null && fileSize <= MAX_VIDEO_SIZE_BYTES;
    return hasBasics && hasMedia && isAdvancedValid;
  }, [title, description, categories.length, media, fileSize, isAdvancedValid]);

  const buildPayload = useCallback(() => {
    if (!media) return null;
    const payload = {
      asset: media as ImagePicker.ImagePickerAsset,
      trim: { start: startSec, end: endSec },
      title: title.trim(),
      description: description.trim(),
      categories: [...categories],
      coverUri,
      fileSize,
      streamInfo: {
        isLockContent: lockContent || undefined,
        lockContentAmount: parsePositiveNumber(lockAmount),
        lockContentTokenSymbol: lockContent ? lockTokenSymbol : undefined,
        isPayPerView: payPerView || undefined,
        payPerViewAmount: parsePositiveNumber(ppvAmount),
        payPerViewTokenSymbol: payPerView ? ppvTokenSymbol : undefined,
        isAddBounty: bounty || undefined,
        addBountyAmount: parsePositiveNumber(bountyAmount),
        addBountyTokenSymbol: bounty ? bountyTokenSymbol : undefined,
        addBountyFirstXViewers: bounty
          ? parsePositiveNumber(bountyFirstXViewer)
          : undefined,
        addBountyFirstXComments: bounty
          ? parsePositiveNumber(bountyFirstXComment)
          : undefined,
      },
    };
    return payload;
  }, [
    media,
    startSec,
    endSec,
    title,
    description,
    categories,
    coverUri,
    fileSize,
    lockContent,
    lockAmount,
    lockTokenSymbol,
    payPerView,
    ppvAmount,
    ppvTokenSymbol,
    bounty,
    bountyAmount,
    bountyTokenSymbol,
    bountyFirstXViewer,
    bountyFirstXComment,
    parsePositiveNumber,
  ]);

  const onUploadMint = useCallback(async () => {
    // Block if user has no ETH to pay gas
    // For imported (local) accounts, block when no ETH; sponsored users (web3auth) proceed
    if (authMethod === 'local' && ethBalance <= 0) {
      toastError("Gas sponsorship isn't available for imported accounts. Please deposit ETH for gas and try again.");
      return;
    }
    if (!media?.uri) return;
    if (fileSize == null) {
      try {
        const info = await FileSystem.getInfoAsync(media.uri);
        if (
          info &&
          (info as any).exists &&
          typeof (info as any).size === "number"
        ) {
          setFileSize((info as any).size as number);
        }
      } catch {}
    }
    const p = buildPayload();
    if (!p) return;
    const info: Record<string, any> = { ...p.streamInfo };
    if (info.isLockContent) {
      const net = supportedNetworks.find(
        (n: any) => (n.label || n.name) === lockNetwork
      );
      info[streamInfoKeys.lockContentChainIds] = net?.chainId ?? undefined;
    }
    if (info.isPayPerView) {
      const net = supportedNetworks.find(
        (n: any) => (n.label || n.name) === ppvNetwork
      );
      info[streamInfoKeys.payPerViewChainIds] = net?.chainId ?? undefined;
    }
    if (info.isAddBounty) {
      const net = supportedNetworks.find(
        (n: any) => (n.label || n.name) === bountyChain
      );
      info[streamInfoKeys.addBountyChainId] = net?.chainId ?? undefined;
    }
    const validity = isValidDataForMinting(
      p.title,
      p.description,
      info,
      user || null,
      tokenBalances || {}
    );
    if (validity.isError) {
      toastError(validity.error);
      return;
    }
    if (info.isAddBounty) {
      const total = getTotalBountyAmount({
        [streamInfoKeys.addBountyAmount]: info[streamInfoKeys.addBountyAmount],
        [streamInfoKeys.addBountyFirstXComments]:
          info[streamInfoKeys.addBountyFirstXComments],
        [streamInfoKeys.addBountyFirstXViewers]:
          info[streamInfoKeys.addBountyFirstXViewers],
      });
      setConfirmText(
        `Are you sure you want to spend ${total} ${
          info[streamInfoKeys.addBountyTokenSymbol] || bountyTokenSymbol
        } on this Bounty Upload?`
      );
      setShowBountyApprove(true);
      setShowConfirm(true);
      return;
    }
    setConfirmText(
      `Are you sure the details are correct and you wish to proceed? NFT uploads can't be edited and it's on chain forever`
    );
    setShowBountyApprove(false);
    setShowConfirm(true);
  }, [media?.uri, fileSize, buildPayload, ethBalance]);

  const handleUpload = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) return;
    // Safety: prevent upload if no ETH for gas
    // For imported (local) accounts, block when no ETH; sponsored users (web3auth) proceed
    if (authMethod === 'local' && ethBalance <= 0) {
      toastError("Gas sponsorship isn't available for imported accounts. Please deposit ETH for gas and try again.");
      return;
    }
    try {
      setIsUploading(true);
      setUploadStage("uploading");

      // // Recompute streamInfo with chainIds per active selections
      const info: Record<string, any> = { ...payload.streamInfo };
      if (info.isLockContent) {
        const net = supportedNetworks.find(
          (n: any) => (n.label || n.name) === lockNetwork
        );
        info[streamInfoKeys.lockContentChainIds] = net?.chainId ?? undefined;
      }
      if (info.isPayPerView) {
        const net = supportedNetworks.find(
          (n: any) => (n.label || n.name) === ppvNetwork
        );
        info[streamInfoKeys.payPerViewChainIds] = net?.chainId ?? undefined;
      }
      if (info.isAddBounty) {
        const net = supportedNetworks.find(
          (n: any) => (n.label || n.name) === bountyChain
        );
        info[streamInfoKeys.addBountyChainId] = net?.chainId ?? undefined;
      }

      // Build FormData following backend naming
      const formData = new FormData();
      formData.append("name", payload.title);
      formData.append("description", payload.description);
      formData.append("postType", "video");
      formData.append("chainId", chainId as unknown as string);
      formData.append("category", JSON.stringify(payload.categories || []));
      formData.append("streamInfo", JSON.stringify(filteredStreamInfo(info)));

      // Video file
      if (payload.asset?.uri) {
        const vName = getFileName(payload.asset.uri, "video.mp4");
        const vType = guessMime(payload.asset.uri, "video/mp4");
        // @ts-ignore React Native FormData file shape
        formData.append("files", {
          uri: payload.asset.uri,
          name: vName,
          type: vType,
        } as any);
      }
      // Thumbnail: prefer cover image if provided, else generated thumb
      const thumb = coverUri || thumbUri;
      if (thumb) {
        const tName = getFileName(thumb, "thumbnail.jpg");
        const tType = guessMime(thumb, "image/jpeg");
        // @ts-ignore React Native FormData file shape
        formData.append("files", {
          uri: thumb,
          name: tName,
          type: tType,
        } as any);
      }

      const res = await minNft(formData);
      setUploadStage("processing");
      const result: any = (res as any)?.data ?? res;
      if (result?.error) {
        throw new Error(
          result?.error_msg || result?.msg || "NFT mint has failed!"
        );
      }

      const createdTokenId = result?.createdTokenId;
      const timestamp = result?.timestamp;
      const v = result?.v;
      const r = result?.r;
      const s = result?.s;
      if (
        createdTokenId == null ||
        timestamp == null ||
        v == null ||
        !r ||
        !s
      ) {
        throw new Error("Mint signature payload missing");
      }

      // If bounty flow, perform mintWithBounty on controller
      if (payload.streamInfo?.isAddBounty) {
        if (!chainId || !streamController) {
          throw new Error("Wallet not ready to mint with bounty");
        }
        setUploadStage("awaiting-wallet");
        const tokenSymbol =
          payload.streamInfo[streamInfoKeys.addBountyTokenSymbol] || "DHB";
        const bountyToken = supportedTokens.find(
          (e) => e.symbol === tokenSymbol && e.chainId === chainId
        );
        if (!bountyToken)
          throw new Error("Unsupported bounty token for this chain");
        const firstXViewer = parsePositiveNumber(bountyFirstXViewer) ?? 0;
        const firstXComment = parsePositiveNumber(bountyFirstXComment) ?? 0;
        const bountyAmountNum = parsePositiveNumber(bountyAmount) ?? 0;
        const tx = await mintWithBounty(
          streamController,
          createdTokenId,
          timestamp,
          v,
          r,
          s,
          bountyToken as any,
          bountyAmountNum,
          firstXViewer,
          firstXComment
        );
        setUploadStage("minting");
        await tx?.wait?.(1);
        setShowConfirm(false);
        setUploadStage("finalizing");
        toastSuccess("Minted successfully!", {
          description:
            "It may take a few minutes for your video to appear in your profile",
        });
        setUploadStage("idle");
        setIsUploading(false);
        (navigation as any).replace(ScreenNames.YourVideos as never);
        return;
      }

      // Standard mint via collection contract
      if (!streamCollectionContract) {
        throw new Error("Wallet not ready to mint");
      }
      console.log("Minting...");
      setUploadStage("awaiting-wallet");
      const tx = await mintNftOnChain(
        streamCollectionContract,
        createdTokenId,
        timestamp,
        v,
        r,
        s
      );
      setUploadStage("minting");
      await tx?.wait?.(1);
      setShowConfirm(false);
      setUploadStage("finalizing");
      toastSuccess("Minted successfully!", {
        description:
          "It may take a few minutes for your video to appear in your profile",
      });
      setUploadStage("idle");
      setIsUploading(false);
      (navigation as any).replace(ScreenNames.YourVideos as never);
    } catch (e: any) {
      console.error("[handleUpload]", e);
      const inMintPhase = ["awaiting-wallet", "minting", "finalizing"].includes(uploadStage);
      const msg = inMintPhase ? parseTxError(e, "send") : (e?.message || "Upload failed");
      toastError(msg);
    } finally {
      setIsUploading(false);
      setUploadStage("idle");
    }
  }, [buildPayload, coverUri, thumbUri, lockNetwork, ppvNetwork, bountyChain, uploadStage, ethBalance]);

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-2">
          <BasicInfoForm
            title={title}
            description={description}
            descriptionMax={DESCRIPTION_MAX}
            onChangeTitle={setTitle}
            onChangeDescription={setDescription}
          />

          <View className="mt-4">
            {categories.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mb-2">
                {categories.map((c) => (
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
            {categories.length < CATEGORIES_MAX && (
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
            categories={categories}
            allCategories={allCategories}
            min={CATEGORIES_MIN}
            max={CATEGORIES_MAX}
            onAdd={addCategory}
            onRemove={removeCategory}
            type="video"
          />

          <UploadAssetsSection
            media={media as any}
            thumbUri={thumbUri}
            fileSize={fileSize}
            coverUri={coverUri}
            onPickVideo={pickVideo}
            onClearVideo={clearSelected}
            onPickCover={pickCoverImage}
            toSeconds={toSeconds}
          />

          <MoreOptionsSection
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            lockContent={lockContent}
            setLockContent={setLockContent}
            lockTokenSymbol={lockTokenSymbol}
            setLockTokenSymbol={setLockTokenSymbol}
            lockNetwork={lockNetwork}
            setLockNetwork={setLockNetwork}
            lockAmount={lockAmount}
            setLockAmount={setLockAmount}
            lockTokenDropdown={lockTokenDropdown}
            networkDropdown={networkDropdown}
            payPerView={payPerView}
            setPayPerView={setPayPerView}
            ppvTokenSymbol={ppvTokenSymbol}
            setPpvTokenSymbol={setPpvTokenSymbol}
            ppvNetwork={ppvNetwork}
            setPpvNetwork={setPpvNetwork}
            ppvAmount={ppvAmount}
            setPpvAmount={setPpvAmount}
            ppvTokenDropdown={ppvTokenDropdown}
            bounty={bounty}
            setBounty={setBounty}
            bountyChain={bountyChain}
            setBountyChain={setBountyChain}
            bountyTokenSymbol={bountyTokenSymbol}
            setBountyTokenSymbol={setBountyTokenSymbol}
            bountyFirstXViewer={bountyFirstXViewer}
            setBountyFirstXViewer={setBountyFirstXViewer}
            bountyFirstXComment={bountyFirstXComment}
            setBountyFirstXComment={setBountyFirstXComment}
            bountyAmount={bountyAmount}
            setBountyAmount={setBountyAmount}
          />
        </View>
      </ScrollView>

      <TrimModal
        visible={showTrimModal}
        onClose={() => {
          setShowTrimModal(false);
          if (media) {
            setStartSec(prevStartRef.current);
            setEndSec(prevEndRef.current);
          } else {
            setPendingAsset(null);
            setStartSec(0);
            setEndSec(0);
          }
          try {
            player.pause();
          } catch {}
        }}
        onCancel={() => {
          setShowTrimModal(false);
          if (media) {
            setStartSec(prevStartRef.current);
            setEndSec(prevEndRef.current);
          } else {
            setPendingAsset(null);
            setStartSec(0);
            setEndSec(0);
          }
          try {
            player.pause();
          } catch {}
        }}
        onContinue={() => {
          setShowTrimModal(false);
          if (pendingAsset) {
            setMedia(pendingAsset);
            (async () => {
              try {
                await generateThumb(pendingAsset.uri);
                const info = await FileSystem.getInfoAsync(pendingAsset.uri);
                if (
                  info &&
                  (info as any).exists &&
                  typeof (info as any).size === "number"
                ) {
                  setFileSize((info as any).size as number);
                }
              } catch {}
            })();
            setCoverUri(null);
            setPendingAsset(null);
          }
          try {
            player.pause();
          } catch {}
        }}
        player={player as any}
        pendingAsset={pendingAsset as any}
        media={media as any}
        startSec={startSec}
        endSec={endSec}
        setTimelineWidth={setTimelineWidth}
        generatingFrames={generatingFrames}
        frameUris={frameUris}
        timelineWidth={timelineWidth}
        toSeconds={toSeconds}
        startPan={startPan}
        endPan={endPan}
        playheadX={playheadX}
        isPlaying={isPlaying}
        onTogglePlay={() => {
          if (!isPlaying) {
            player.currentTime = startSec;
            player.play();
          } else {
            player.pause();
          }
        }}
      />

      <View className="px-4 pt-2 pb-6 mb-6">
        <AccentButtonGradient>
          <TouchableOpacity
            disabled={isSignedIn ? !isFormValid : false}
            onPress={() => {
              if (!isSignedIn) {
                // Trigger sign-in gateway; continue to upload after successful sign-in
                requireAuth(() => onUploadMint());
                return;
              }
              onUploadMint();
            }}
            className="h-12 rounded-xl items-center justify-center"
            style={{ backgroundColor: 'transparent' }}
          >
            <Text className="text-white font-semibold">
              {isSignedIn ? "Upload & Mint" : "Sign In"}
            </Text>
          </TouchableOpacity>
        </AccentButtonGradient>
        {media && fileSize != null && fileSize > MAX_VIDEO_SIZE_BYTES && (
          <Text className="text-xs text-red-500 mt-1">
            Video exceeds max size of 200MB.
          </Text>
        )}
      </View>

      <ConfirmUploadModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleUpload}
        confirmText={confirmText}
        stage={uploadStage}
        variant={showBountyApprove ? "bounty" : "default"}
      />
    </View>
  );
}
