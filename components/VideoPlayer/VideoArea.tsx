import React, { useMemo, useState, useCallback } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import VideoPlayerCore from "../VideoPlayerCore";
import { toastInfo } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useUser, useAuthState, useAuthActions, useProvider } from "../../context/AuthContext";
import PPVModal from "../PPV/PPVModal";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { ChainId, supportedChainIds } from "../../config/constants";
import { isSolanaChain } from "../../config/solana.constants";

export interface VideoAreaProps {
  isTranscoding: boolean;
  isLockedOrPPV: boolean;
  lockedFetchLoading: boolean;
  effectiveVideoUrl: string | null | undefined;
  accessInfo?: any;
  streamInfo?: any; // minimal streamInfo (lock/ppv amounts)
  minter?: string;
  tokenId: number | string | undefined;
  onProgress?: (positionMs: number, durationMs: number) => void;
  isLive?: boolean;
  onPPVSuccess?: () => void;
  /** When true, video fills the entire container instead of using 16:9 aspect ratio */
  fullscreen?: boolean;
  /** Suppress the player's built-in top controls when an external header already provides close/mute. */
  hideTopControls?: boolean;
}

const VideoArea: React.FC<VideoAreaProps> = ({
  isTranscoding,
  isLockedOrPPV,
  lockedFetchLoading,
  effectiveVideoUrl,
  accessInfo,
  streamInfo,
  minter,
  tokenId,
  onProgress,
  isLive,
  onPPVSuccess,
  fullscreen,
  hideTopControls,
}) => {
  const normalizedUrl: string | null =
    effectiveVideoUrl === undefined ? null : effectiveVideoUrl;
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const { chainId } = useProvider();
  const navigation = useNavigation<any>();
  const userDhbBalance: number =
    (user?.tokenBalances?.DHB as number) || (user?.stakedDHB as number) || 0;
  const isFree = accessInfo?.streamStatus?.isFree === true;
  const minterAddress: string | undefined = useMemo(
    () =>
      minter ||
      accessInfo?.nft?.minter ||
      accessInfo?.minter ||
      accessInfo?.creator ||
      undefined,
    [minter, accessInfo]
  );
  const ppvAmount = streamInfo?.payPerViewAmount;
  const ppvSymbol = streamInfo?.payPerViewTokenSymbol;
  const [ppvOpen, setPpvOpen] = useState(false);
  const ppvChainIdsRaw: any = (streamInfo as any)?.payPerViewChainIds;
  const ppvChainIds: number[] = Array.isArray(ppvChainIdsRaw)
    ? (ppvChainIdsRaw as number[])
    : ppvChainIdsRaw != null
    ? [Number(ppvChainIdsRaw)]
    : [];
  // Solana PPV (#41) pays in SOL/SPL — no EVM chain switch needed.
  const isSolanaPpv = isSolanaChain(ppvChainIds[0]);
  const hasSupportedPPVChain = ppvChainIds.length === 0 || isSolanaPpv
    ? true
    : ppvChainIds.some((id) => supportedChainIds.includes(Number(id)));
  const isWrongChainForPPV = Boolean(
    !isSolanaPpv && isLockedOrPPV && ppvChainIds.length > 0 && chainId != null && !ppvChainIds.includes(Number(chainId))
  );

  const requiredChainLabel = useMemo(() => {
    if (!ppvChainIds.length) return "";
    const toLabel = (id: number) =>
      id === ChainId.BASE_MAINNET ? "Base" : id === ChainId.BSC_MAINNET ? "BSC" : `Chain ${id}`;
    return ppvChainIds.map(toLabel).join(" or ");
  }, [ppvChainIds]);

  const goToSettings = useCallback(() => {
    navigation.navigate(ScreenNames.AccountSettings as any);
  }, [navigation]);

  // openInApp centralized in libs/links.utils

  const handleSignIn = () => {
    requireAuth(() => {}); // triggers modal; no immediate action
  };

  const handleTopUp = (_neededAmt: any, _neededSymbol: string) => {
    if (chainId !== ChainId.BASE_MAINNET) {
      toastInfo("Dpay is only available on Base.");
      return;
    }
    navigation.navigate(ScreenNames.Dpay);
  };

  const handleUnlockPPV = (_ppvAmt: any, _ppvSymbol: string) => {
    console.log({
      _ppvAmt,
      _ppvSymbol,
      minterAddress,
      tokenId,
      ppvAmount,
      ppvSymbol,
    });
    requireAuth(() => setPpvOpen(true));
  };

  // Transcoding state
  if (isTranscoding) {
    return (
      <View className="w-full aspect-video bg-black items-center justify-center">
        <Ionicons name="videocam" size={48} color="#8B8D90" />
        <Text className="text-theme-neutrals-300 mt-2 text-sm">
          Transcoding…
        </Text>
      </View>
    );
  }

  // Live streams require sign in even if free
  if (isLive && !isSignedIn) {
    return (
      <View className="w-full aspect-video bg-black items-center justify-center px-6">
        <Ionicons name="log-in" size={46} color="#8B8D90" />
        <Text
          className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
          numberOfLines={3}
        >
          Sign in to view this live.
        </Text>
        <TouchableOpacity
          onPress={handleSignIn}
          className="mt-4 bg-white/10 border border-white/20 rounded-xl px-5 py-2"
          activeOpacity={0.85}
        >
          <Text className="text-white text-xs font-semibold">
            Sign In
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isFree && !isSignedIn) {
    return (
      <View className="w-full aspect-video bg-black items-center justify-center px-6">
        <Ionicons name="log-in" size={46} color="#8B8D90" />
        <Text
          className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
          numberOfLines={3}
        >
          Sign in to unlock and view this video.
        </Text>
        <TouchableOpacity
          onPress={handleSignIn}
          className="mt-4 bg-white/10 border border-white/20 rounded-xl px-5 py-2"
          activeOpacity={0.85}
        >
          <Text className="text-white text-xs font-semibold">
            Sign In
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // While awaiting locked NFT/access resolution
  if (isLockedOrPPV && lockedFetchLoading) {
    return (
      <View className="w-full aspect-video bg-black items-center justify-center">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // Post-fetch locked logic
  const status = accessInfo?.streamStatus || {};
  const isLockedWithLockContent = !!status?.isLockedWithLockContent;
  const isLockedWithPPV = !!status?.isLockedWithPPV;
  const missingPlayable = isLockedOrPPV && !normalizedUrl;

  if (missingPlayable) {
    if (isLockedWithLockContent) {
      const neededAmt = streamInfo?.lockContentAmount ?? "—";
      const neededSymbol = streamInfo?.lockContentTokenSymbol || "";
      return (
        <View className="w-full aspect-video bg-black items-center justify-center px-6">
          <Ionicons name="lock-closed" size={46} color="#8B8D90" />
          <Text
            className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
            numberOfLines={3}
          >
            Please hold at least {formatCompactNumber(neededAmt)} {neededSymbol} to unlock.
          </Text>
          <Text className="text-theme-neutrals-400 mt-2 text-[11px]">
            Your DHB balance: {formatCompactNumber(userDhbBalance)}
          </Text>
          <TouchableOpacity
            onPress={() => handleTopUp(neededAmt, neededSymbol)}
            className="mt-4 bg-white/10 border border-white/20 rounded-xl px-5 py-2"
            activeOpacity={0.85}
          >
            <Text className="text-white text-xs font-semibold">
              Top Up
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (isLockedWithPPV) {
      const ppvAmt = streamInfo?.payPerViewAmount ?? "—";
      const ppvSymbol = streamInfo?.payPerViewTokenSymbol || "";
      // If the PPV network(s) are not supported by this app, inform the user and block unlock
      if (ppvChainIds.length > 0 && !hasSupportedPPVChain) {
        return (
          <View className="w-full aspect-video bg-black items-center justify-center px-6">
            <Ionicons name="warning" size={46} color="#8B8D90" />
            <Text
              className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
              numberOfLines={3}
            >
              This content requires a network that is no longer available.
            </Text>
            <Text className="text-theme-neutrals-400 mt-2 text-center text-xs leading-5" numberOfLines={3}>
              PPV is unavailable for this video due to unsupported network configuration.
            </Text>
          </View>
        );
      }
      if (isWrongChainForPPV) {
        return (
          <View className="w-full aspect-video bg-black items-center justify-center px-6">
            <Ionicons name="swap-horizontal" size={46} color="#8B8D90" />
            <Text
              className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
              numberOfLines={3}
            >
              You are on the wrong network.
            </Text>
            <Text className="text-theme-neutrals-400 mt-2 text-center text-xs leading-5" numberOfLines={3}>
              This content requires PPV on {requiredChainLabel || "another network"}. Go to Settings and switch to the required network to pay.
            </Text>
            <TouchableOpacity
              onPress={goToSettings}
              className="mt-4 bg-white/10 border border-white/20 rounded-xl px-5 py-2"
              activeOpacity={0.85}
            >
              <Text className="text-white text-xs font-semibold">Open Settings</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View className="w-full aspect-video bg-black items-center justify-center px-6">
          <Ionicons name="pricetag" size={46} color="#8B8D90" />
          <Text
            className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
            numberOfLines={3}
          >
            Unlock PPV stream with {formatCompactNumber(ppvAmt)} {ppvSymbol}
          </Text>
          <PPVModal
            open={ppvOpen}
            onOpenChange={setPpvOpen}
            tokenId={Number(tokenId)}
            toAddress={minterAddress as string}
            amount={ppvAmount as any}
            tokenSymbol={ppvSymbol as string}
            paymentChainId={ppvChainIds[0]}
            trigger={
              <TouchableOpacity
                onPress={() => handleUnlockPPV(ppvAmt, ppvSymbol)}
                className="mt-4 flex-row items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-5 py-2"
                activeOpacity={0.85}
              >
                <Ionicons name="pricetag-outline" size={16} color="#fff" />
                <Text className="text-white text-xs font-semibold">
                  Unlock
                </Text>
              </TouchableOpacity>
            }
            onSuccess={() => {
              setPpvOpen(false);
              onPPVSuccess?.();
            }}
          />
        </View>
      );
    }
    return (
      <View className="w-full aspect-video bg-black items-center justify-center px-6">
        <Ionicons name="alert-circle" size={46} color="#8B8D90" />
        <Text
          className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
          numberOfLines={3}
        >
          Failed to resolve token
        </Text>
      </View>
    );
  }

  const containerClass = fullscreen
    ? "flex-1 bg-black"
    : "w-full aspect-video bg-black";

  return (
  <View className={containerClass} pointerEvents="auto">
      <VideoPlayerCore
        sourceUrl={normalizedUrl}
        autoplay
        loop
        liveMode={!!isLive}
        hideTopControls={hideTopControls}
        tokenId={isLive ? undefined : tokenId}
        onProgress={onProgress}
      />
    </View>
  );
};

export default VideoArea;
