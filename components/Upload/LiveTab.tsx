import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from "react-native";
import UploadHeader from "./UploadHeader";
import BasicInfoForm from "./BasicInfoForm";
import UploadCategoriesSelector from "./UploadCategoriesSelector";
import MoreOptionsSection from "./MoreOptionsSection";
import GlassModal from "../ui/GlassModal"; // still used elsewhere (clipboard etc.)
import { useAuth } from "../../context/AuthContext";
import {
  filteredStreamInfo,
  isValidDataForMinting,
  getTotalBountyAmount,
} from "../../libs/validators.util";
import {
  supportedNetworks,
  supportedTokensForLockContent,
  supportedTokensForPPV,
} from "../../config";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastError } from "../../libs/toast";
import * as ImagePicker from "expo-image-picker";
import {
  getUserScheduledLives,
  ScheduledLiveItem,
  createLiveStream,
} from "../../services/live.service";
import { getCategoriesCached, minNft } from "../../services/nft.service";
import { mintWithBounty, mintNftOnChain } from "../../services/mint.service";
import { streamInfoKeys, supportedTokens } from "../../config/constants";
import {
  useWeb3Provider,
  useStreamControllerContract,
  useStreamCollectionContract,
} from "../../hooks/use-web3";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { Ionicons } from "@expo/vector-icons";
import InteractionOptionsSection from "./InteractionOptionsSection";
import ConfirmUploadModal from "./ConfirmUploadModal";
import ScheduledLivesModal from "./ScheduledLivesModal";
import { getUserLiveVideos } from "../../services/user.service";
import { mediaDevices, RTCPeerConnection, RTCView } from "react-native-webrtc";


const DESCRIPTION_MAX = 400;
const CATEGORIES_MIN = 1;
const CATEGORIES_MAX = 5;

const LiveTab = ({ onClose }: { onClose: () => void }) => {
  const { isSignedIn, requireAuth, user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const [stage, setStage] = useState<
    | "idle"
    | "uploading"
    | "processing"
    | "awaiting-wallet"
    | "minting"
    | "finalizing"
    | "done"
  >("idle");
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [createdStream, setCreatedStream] = useState<any>(null);

  const [enableChat, setEnableChat] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [minTip, setMinTip] = useState<string>("1000");

  const [scheduledLives, setScheduledLives] = useState<ScheduledLiveItem[]>([]);
  const [dueLives, setDueLives] = useState<ScheduledLiveItem[]>([]);
  const [showScheduledModal, setShowScheduledModal] = useState(false);
  const [nextScheduledCountdown, setNextScheduledCountdown] = useState<
    string | null
  >(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showBountyApprove, setShowBountyApprove] = useState(false);

  // Compute countdown to the nearest upcoming scheduled live
  useEffect(() => {
    const compute = () => {
      const upcoming = scheduledLives
        .filter((s) => !!s.scheduleAt)
        .map((s) => new Date(s.scheduleAt as any))
        .filter((d) => d.getTime() > Date.now())
        .sort((a, b) => a.getTime() - b.getTime());
      if (!upcoming.length) {
        setNextScheduledCountdown(null);
        return;
      }
      const target = upcoming[0].getTime();
      const diffMs = target - Date.now();
      if (diffMs <= 0) {
        setNextScheduledCountdown(null);
        return;
      }
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;
      let label: string;
      if (diffMs < minute) label = "<1m";
      else if (diffMs < hour) label = `${Math.ceil(diffMs / minute)}m`;
      else if (diffMs < day) label = `${Math.ceil(diffMs / hour)}h`;
      else label = `${Math.ceil(diffMs / day)}d`;
      setNextScheduledCountdown(label);
    };
    compute();
    const id = setInterval(compute, 30 * 1000);
    return () => clearInterval(id);
  }, [scheduledLives]);

  useEffect(() => {
  console.log('[WebRTCPublisher] mediaDevices raw =', mediaDevices);
  console.log('mediaDevices keys =', Object.keys(mediaDevices));

}, []);

  useEffect(() => {
    let mounted = true;
    const address = (user as any)?.walletAddress || (user as any)?.address;
    if (!address) return; // load only when we have address
    (async () => {
      const list = await getUserScheduledLives(address);
      if (mounted) setScheduledLives(list);
      // Fetch top 10 user live streams to derive "due" (offline, unscheduled)
      try {
        const livesRes = await getUserLiveVideos(address, { unit: 10 });
        const items = Array.isArray(livesRes?.result) ? livesRes.result : [];
        const due = items
          .filter((i: any) => {
            const statusRaw = (i?.status || i?.streamInfo?.status || "")
              .toString()
              .toUpperCase();
            const isLive =
              statusRaw === "LIVE" || i?.streamInfo?.isLive === true;
            const isScheduled =
              statusRaw === "SCHEDULED" || !!i?.scheduledFor || !!i?.scheduleAt;
            const isOffline = !isLive && statusRaw !== "ENDED";
            return isOffline && !isScheduled;
          })
          .slice(0, 10)
          .map((i: any) => ({
            streamId: String(
              i?._id || i?.id || i?.streamId || i?.tokenId || ""
            ),
            name: i?.name || i?.title || "Untitled",
            // Use createdAt as the date reference for due streams so UI can show date/relative
            scheduleAt: i?.createdAt ? new Date(i.createdAt).getTime() : null,
            thumbnailUrl:
              i?.thumbnailUrl || i?.imageUrl || i?.thumbnail || null,
          }))
          .filter((x: any) => x.streamId);
        if (mounted) setDueLives(due);
      } catch (e) {
        // quietly ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.walletAddress, user?.address]);

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

  const lockTokenDropdown = useMemo(
    () =>
      Array.from(
        new Set(supportedTokensForLockContent.map((t) => t.symbol))
      ).map((sym) => ({
        label: sym,
        value: sym,
        disabled: sym.toLowerCase() === "bnb",
      })),
    []
  );
  const ppvTokenDropdown = useMemo(
    () =>
      Array.from(new Set(supportedTokensForPPV.map((t) => t.symbol))).map(
        (sym) => ({
          label: sym,
          value: sym,
          disabled: sym.toLowerCase() === "bnb",
        })
      ),
    []
  );
  const networkDropdown = useMemo(
    () =>
      Array.from(
        new Set(supportedNetworks.map((n: any) => n.label || n.name))
      ).map((n) => ({
        label: n,
        value: n,
        disabled:
          n.toLowerCase().includes("bnb") ||
          n.toLowerCase().includes("binance"),
      })),
    []
  );

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
    [categories]
  );
  const removeCategory = useCallback((name: string) => {
    setCategories((prev) =>
      prev.filter((c) => c.toLowerCase() !== name.toLowerCase())
    );
  }, []);

  const { chainId } = useWeb3Provider();
  const streamController = useStreamControllerContract();
  const streamCollectionContract = useStreamCollectionContract();
  const navigation = useNavigation<any>();

  const canSubmit = useMemo(() => {
    if (stage !== "idle") return false;
    if (title.trim().length < 3) return false;
    if (description.trim().length < 3) return false;
    if (categories.length < CATEGORIES_MIN) return false;
    if (!thumbnailUri) return false; // thumbnail required
    const minTipNum = Number(minTip);
    if (!Number.isFinite(minTipNum) || minTipNum < 1000) return false;
    return true;
  }, [title, description, categories.length, stage, minTip, thumbnailUri]);

  const pickThumbnail = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        setThumbnailUri(res.assets[0].uri);
      }
    } catch (e) {
      toastError(e, "Thumbnail pick failed");
    }
  }, []);

  // Separate confirmation step from actual mint/create
  const performCreate = useCallback(async () => {
    try {
      setStage("uploading");
      const tokenBalances = (user as any)?.tokenBalances || {};
      const info: Record<string, any> = {
        isLockContent: lockContent,
        lockContentTokenSymbol: lockTokenSymbol,
        lockContentChainIds: lockNetwork ? [lockNetwork] : undefined,
        lockContentAmount: lockAmount,
        isPayPerView: payPerView,
        payPerViewTokenSymbol: ppvTokenSymbol,
        payPerViewChainIds: ppvNetwork ? [ppvNetwork] : undefined,
        payPerViewAmount: ppvAmount,
        isAddBounty: bounty,
        addBountyChainId: bountyChain,
        addBountyTokenSymbol: bountyTokenSymbol,
        addBountyFirstXViewers: bountyFirstXViewer,
        addBountyFirstXComments: bountyFirstXComment,
        addBountyAmount: bountyAmount,
      };
      const validation = isValidDataForMinting(
        title,
        description,
        info,
        user,
        tokenBalances
      );
      if (validation.isError) {
        toastError(validation.error || "Invalid live data");
        setStage("idle");
        return;
      }
      const formData = new FormData();
      formData.append("name", title.trim());
      formData.append("description", description.trim());
      formData.append("postType", "live");
      formData.append("category", JSON.stringify(categories));
      formData.append("chainId", chainId as unknown as string);
      formData.append(
        "streamInfo",
        JSON.stringify(
          filteredStreamInfo({
            ...info,
          })
        )
      );
      if (thumbnailUri) {
        const fname =
          thumbnailUri.split("/").pop() || `thumbnail-${Date.now()}.jpg`;
        // @ts-ignore
        formData.append("files", {
          uri: thumbnailUri,
          name: fname,
          type: "image/jpeg",
        } as any);
      }
      const mintRes: any = await minNft(formData);
      const sigPayload: any = (mintRes as any)?.data ?? mintRes;
      if (sigPayload?.error) {
        throw new Error(sigPayload?.msg || "Mint preparation failed");
      }
      const { createdTokenId, timestamp, v, r, s } = sigPayload;
      if (
        createdTokenId == null ||
        timestamp == null ||
        v == null ||
        !r ||
        !s
      ) {
        throw new Error("Mint signature payload missing");
      }
      if (info.isAddBounty) {
        if (!streamController || !chainId)
          throw new Error("Controller contract unavailable");
        setStage("awaiting-wallet");
        const tokenSymbol = info[streamInfoKeys.addBountyTokenSymbol] || "DHB";
        const bountyToken = supportedTokens.find(
          (e) => e.symbol === tokenSymbol && e.chainId === chainId
        );
        if (!bountyToken) throw new Error("Unsupported bounty token");
        const viewers = Number(bountyFirstXViewer) || 0;
        const comments = Number(bountyFirstXComment) || 0;
        const bountyAmountNum = Number(bountyAmount) || 0;
        const tx = await mintWithBounty(
          streamController,
          createdTokenId,
          timestamp,
          v,
          r,
          s,
          bountyToken as any,
          bountyAmountNum,
          viewers,
          comments
        );
        setStage("minting");
        await tx?.wait?.(1);
      } else {
        if (!streamCollectionContract)
          throw new Error("Collection contract unavailable");
        setStage("awaiting-wallet");
        const tx = await mintNftOnChain(
          streamCollectionContract,
          createdTokenId,
          timestamp,
          v,
          r,
          s
        );
        setStage("minting");
        await tx?.wait?.(1);
      }
      setStage("finalizing");
      const effectiveScheduledDate = scheduleEnabled
        ? scheduledDate || new Date(Date.now() + 6 * 60 * 60 * 1000)
        : undefined;
      const backendRes = await createLiveStream({
        title: title.trim(),
        description: description.trim(),
        tokenId: createdTokenId,
        categories,
        streamInfo: filteredStreamInfo(info),
        settings: {
          enableChat,
          schedule: scheduleEnabled,
          minTip: Number(minTip) || 1000,
          tipDelay: 0,
        },
        status: scheduleEnabled ? "SCHEDULED" : "LIVE",
        scheduledFor: effectiveScheduledDate,
        thumbnailUri,
      });
      setCreatedStream(backendRes);
      setStage("done");
      setShowConfirm(false);
      navigation.navigate(ScreenNames.LiveProducer as any, {
        streamId: backendRes?._id,
        tokenId: createdTokenId,
      });
    } catch (e: any) {
      toastError(e?.message || "Live creation failed");
      setStage("idle");
    }
  }, [
    bounty,
    bountyAmount,
    bountyFirstXComment,
    bountyFirstXViewer,
    bountyTokenSymbol,
    bountyChain,
    categories,
    chainId,
    description,
    enableChat,
    lockAmount,
    lockContent,
    lockNetwork,
    lockTokenSymbol,
    minTip,
    navigation,
    payPerView,
    ppvAmount,
    ppvNetwork,
    ppvTokenSymbol,
    scheduleEnabled,
    scheduledDate,
    streamCollectionContract,
    streamController,
    thumbnailUri,
    title,
    user,
  ]);

  const initiateCreate = useCallback(() => {
    if (!canSubmit) return;
    // Validate scheduling window
    if (scheduleEnabled) {
      const chosen = scheduledDate || new Date(Date.now() + 6 * 60 * 60 * 1000);
      if (chosen.getTime() - Date.now() < 30 * 60 * 1000) {
        toastError("Scheduled time must be at least 30 minutes from now.");
        return;
      }
    }
    if (bounty) {
      const temp: Record<string, any> = {
        [streamInfoKeys.addBountyAmount]: Number(bountyAmount) || 0,
        [streamInfoKeys.addBountyFirstXViewers]:
          Number(bountyFirstXViewer) || 0,
        [streamInfoKeys.addBountyFirstXComments]:
          Number(bountyFirstXComment) || 0,
      };
      const total = getTotalBountyAmount(temp);
      setConfirmText(
        `Are you sure you want to spend ${total} ${
          bountyTokenSymbol || "DHB"
        } on this Bounty Livestream?`
      );
      setShowBountyApprove(true);
    } else {
      setConfirmText(
        "Are you sure the details are correct and you wish to proceed? Live stream NFT mint will be on chain forever"
      );
      setShowBountyApprove(false);
    }
    setShowConfirm(true);
  }, [
    bounty,
    bountyAmount,
    bountyFirstXComment,
    bountyFirstXViewer,
    bountyTokenSymbol,
    canSubmit,
    scheduleEnabled,
    scheduledDate,
  ]);

  return (
    <View className="flex-1 bg-black">
      <UploadHeader title="Create Livestream" onClose={onClose} />
      <ScrollView className="flex-1 px-4">
        <View className="flex-row items-center justify-end">
          {scheduledLives.length + dueLives.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowScheduledModal(true)}
              className="flex-row items-center px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700"
            >
              <Ionicons name="calendar" size={14} color="#fff" />
              <Text className="text-white text-xs ml-1">Scheduled</Text>
              <View className="ml-2 px-1.5 py-0.5 rounded bg-blue-600">
                <Text className="text-[10px] text-white font-semibold">
                  {scheduledLives.length + dueLives.length}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <BasicInfoForm
          title={title}
          description={description}
          descriptionMax={DESCRIPTION_MAX}
          onChangeTitle={setTitle}
          onChangeDescription={setDescription}
        />

        <UploadCategoriesSelector
          categories={categories}
          allCategories={allCategories}
          categoryQuery={categoryQuery}
          setCategoryQuery={setCategoryQuery}
          open={categoryOpen}
          setOpen={setCategoryOpen}
          min={CATEGORIES_MIN}
          max={CATEGORIES_MAX}
          onAdd={addCategory}
          onRemove={removeCategory}
        />

        {/* Thumbnail Picker */}
        <View className="mb-5">
          <Text className="text-gray-400 mb-1">
            Thumbnail <Text className="text-red-500">*</Text>
          </Text>
          {thumbnailUri ? (
            <View className="w-full aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 mb-2">
              <Image
                source={{ uri: thumbnailUri }}
                resizeMode="cover"
                style={{ width: "100%", height: "100%" }}
              />
              <View className="absolute top-2 right-2 flex-row">
                <TouchableOpacity
                  onPress={pickThumbnail}
                  className="mr-2 w-8 h-8 rounded-full bg-black/60 items-center justify-center border border-white/10"
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setThumbnailUri(null)}
                  className="w-8 h-8 rounded-full bg-black/60 items-center justify-center border border-white/10"
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickThumbnail}
              className="h-32 rounded-xl border border-dashed border-zinc-700 bg-zinc-900 items-center justify-center"
            >
              <Ionicons name="image" size={28} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs mt-2">Add Thumbnail</Text>
            </TouchableOpacity>
          )}
        </View>

        <InteractionOptionsSection
          enableChat={enableChat}
          setEnableChat={setEnableChat}
          scheduleEnabled={scheduleEnabled}
          setScheduleEnabled={setScheduleEnabled}
          scheduledDate={scheduledDate}
          setScheduledDate={setScheduledDate}
          minTip={minTip}
          setMinTip={setMinTip}
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
      </ScrollView>

      <View className="px-4 pt-2 pb-6 mb-14">
        <TouchableOpacity
          disabled={!canSubmit}
          onPress={() => {
            if (!isSignedIn) {
              requireAuth(() => {});
              return;
            }
            initiateCreate();
          }}
          className={`h-12 rounded-xl items-center justify-center ${
            canSubmit ? "bg-blue-600" : "bg-zinc-700"
          }`}
        >
          <Text className="text-white font-semibold">
            {(() => {
              if (!isSignedIn) return "Sign In";
              switch (stage) {
                case "uploading":
                  return "Preparing Metadata…";
                case "processing":
                  return "Processing…";
                case "awaiting-wallet":
                  return "Confirm In Wallet…";
                case "minting":
                  return "Minting…";
                case "finalizing":
                  return "Finalizing…";
                case "done":
                  return "Created";
                default:
                  return "Create Livestream";
              }
            })()}
          </Text>
        </TouchableOpacity>
      </View>

      <ScheduledLivesModal
        visible={showScheduledModal}
        onClose={() => setShowScheduledModal(false)}
        scheduledLives={scheduledLives}
        dueLives={dueLives}
        onOpen={(item) => {
          if (!item?.streamId) return;
          navigation.navigate(ScreenNames.LiveProducer as any, {
            streamId: item.streamId,
          });
        }}
      />

      <ConfirmUploadModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={performCreate}
        confirmText={confirmText}
        stage={stage as any}
        variant={showBountyApprove ? "bounty" : "default"}
        title={showBountyApprove ? "Confirm Bounty Live" : "Confirm Details"}
      />
    </View>
  );
};

export default LiveTab;
