import React, { useMemo, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import VideoPlayerCore from "../VideoPlayerCore";
import { BUY_FROM_DEX_LINK } from "../../config/links";
import { openInApp } from "../../libs/links.utils";
import { useAuth } from "../../context/AuthContext";
import PPVModal from "../PPV/PPVModal";

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
}) => {
  const normalizedUrl: string | null =
    effectiveVideoUrl === undefined ? null : effectiveVideoUrl;
  const { user, isSignedIn, requireAuth } = useAuth();
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
  //   const tokenId: number | string | undefined = useMemo(
  //     () =>
  //       accessInfo?.tokenId ||
  //       accessInfo?.nft?.tokenId ||
  //       accessInfo?.result?.tokenId ||
  //       undefined,
  //     [accessInfo]
  //   );
  const ppvAmount = streamInfo?.payPerViewAmount;
  const ppvSymbol = streamInfo?.payPerViewTokenSymbol;
  const [ppvOpen, setPpvOpen] = useState(false);

  // openInApp centralized in libs/links.utils

  const handleSignIn = () => {
    requireAuth(() => {}); // triggers modal; no immediate action
  };

  const handleTopUp = (_neededAmt: any, _neededSymbol: string) => {
    openInApp(BUY_FROM_DEX_LINK);
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
        <Ionicons name="videocam" size={48} color="#888" />
        <Text className="text-theme-neutrals-300 mt-2 text-sm">
          Transcoding…
        </Text>
      </View>
    );
  }

  if (!isFree && !isSignedIn) {
    return (
      <View className="w-full aspect-video bg-black items-center justify-center px-6">
        <Ionicons name="log-in" size={46} color="#888" />
        <Text
          className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
          numberOfLines={3}
        >
          Sign in to unlock and view this video.
        </Text>
        <TouchableOpacity
          onPress={handleSignIn}
          className="mt-4 px-5 py-2 rounded-full bg-theme-accent"
          activeOpacity={0.85}
        >
          <Text className="text-theme-neutrals-900 text-xs font-semibold">
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
          <Ionicons name="lock-closed" size={46} color="#888" />
          <Text
            className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
            numberOfLines={3}
          >
            Please hold at least {neededAmt} {neededSymbol} to unlock.
          </Text>
          <Text className="text-theme-neutrals-400 mt-2 text-[11px]">
            Your DHB balance: {userDhbBalance}
          </Text>
          <TouchableOpacity
            onPress={() => handleTopUp(neededAmt, neededSymbol)}
            className="mt-4 px-5 py-2 rounded-full bg-theme-accent"
            activeOpacity={0.85}
          >
            <Text className="text-theme-neutrals-900 text-xs font-semibold">
              Top Up
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (isLockedWithPPV) {
      const ppvAmt = streamInfo?.payPerViewAmount ?? "—";
      const ppvSymbol = streamInfo?.payPerViewTokenSymbol || "";
      return (
        <View className="w-full aspect-video bg-black items-center justify-center px-6">
          <Ionicons name="pricetag" size={46} color="#888" />
          <Text
            className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
            numberOfLines={3}
          >
            Unlock PPV stream with {ppvAmt} {ppvSymbol}
          </Text>
          <PPVModal
            open={ppvOpen}
            onOpenChange={setPpvOpen}
            tokenId={Number(tokenId)}
            toAddress={minterAddress as string}
            amount={ppvAmount as any}
            tokenSymbol={ppvSymbol as string}
            trigger={
              <TouchableOpacity
                onPress={() => handleUnlockPPV(ppvAmt, ppvSymbol)}
                className="flex-1 flex-row items-center gap-2 max-h-9 mt-4 px-5 py-2 rounded-full bg-theme-accent"
                activeOpacity={0.85}
              >
                <Ionicons name="pricetag-outline" size={16} color="#000" />
                <Text className="text-theme-neutrals-900 text-xs font-semibold">
                  Unlock
                </Text>
              </TouchableOpacity>
            }
            onSuccess={() => {}}
          />
        </View>
      );
    }
    return (
      <View className="w-full aspect-video bg-black items-center justify-center px-6">
        <Ionicons name="alert-circle" size={46} color="#888" />
        <Text
          className="text-theme-neutrals-200 mt-3 text-center text-sm leading-5"
          numberOfLines={3}
        >
          Failed to resolve token
        </Text>
      </View>
    );
  }

  return (
  <View className="w-full aspect-video bg-black" pointerEvents="auto">
      <VideoPlayerCore
        sourceUrl={normalizedUrl}
        autoplay
        loop
        initialMuted
        onProgress={onProgress}
      />
    </View>
  );
};

export default VideoArea;
