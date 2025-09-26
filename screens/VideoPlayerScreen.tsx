import React, { useEffect, useMemo } from "react";
import { View } from "react-native";
import { useRoute } from "@react-navigation/native";
import NormalVideoPlayer from "../components/VideoPlayer/NormalVideoPlayer";
import LiveStreamPlayer from "../components/VideoPlayer/LiveStreamPlayer";
import { useStreamAccessInfo } from "../libs/validators.util";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";

interface RouteParams {
  tokenId?: string;
  isLive?: boolean;
  streamKey?: string;
  nft?: any;
  meta?: any;
  accessInfo?: any;
}

const VideoPlayerScreen: React.FC = () => {
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams | any;
  const isLive = params?.isLive;
  const nft = params?.nft;
  const accessInfo = params?.accessInfo;
  // Support tokenId passed directly or inside nft
  const tokenId = (params as any)?.tokenId ?? (nft as any)?.tokenId;
  // console.log(accessInfo)
  const nftMetadata = useMemo(() => {
    if (nft) return nft;
    return undefined;
  }, [nft, tokenId]);

  // Close the user profile bottom sheet if it's open when entering the video player
  const { hideUserProfile } = useUserProfileSheet();
  useEffect(() => {
    hideUserProfile();
  }, [hideUserProfile, tokenId]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {/* {isLive ? (
        <LiveStreamPlayer tokenId={tokenId} />
      ) : ( */}
        <NormalVideoPlayer
          tokenId={tokenId}
          videoUrl={accessInfo?.playableVideoUrl}
          minter={nftMetadata?.minter}
          description={nftMetadata?.description}
          title={nftMetadata?.name}
          views={nftMetadata?.views}
          totalTips={nftMetadata?.tips}
          createdAt={nftMetadata?.createdAt}
          accessInfo={accessInfo}
          isTranscoding={nftMetadata?.transcodingStatus === "on"}
        />
      {/* )} */}
    </View>
  );
};

export default VideoPlayerScreen;
