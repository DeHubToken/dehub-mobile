/**
 * PostResolverScreen
 *
 * Lightweight screen used by deep links (dehub.io/app/post/:tokenId).
 * We don't know from the URL alone whether a tokenId is a video or a feed post,
 * so this screen fetches the metadata, checks `postType`, and immediately
 * replaces itself in the stack with the correct destination screen.
 */
import React, { useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { getNFT } from "../services/nft.service";
import { isVideoItem } from "../services/feed.unified.service";
import { ScreenNames } from "../navigation/ScreenNames";
import { createLogger } from "../libs/logger";

const logger = createLogger("PostResolver");

const PostResolverScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const tokenId: string | undefined =
    route.params?.tokenId ?? route.params?.postId ?? route.params?.id;
  const commentId: string | undefined =
    route.params?.commentId ?? route.params?.c;

  const resolve = useCallback(async () => {
    if (!tokenId) {
      logger.warn("No tokenId — going home");
      navigation.replace(ScreenNames.Root);
      return;
    }

    try {
      const res = await getNFT(tokenId);
      const payload: any = res?.result || res || {};

      if (isVideoItem(payload)) {
        // Video → replace with VideoPlayer
        logger.info("Resolved as video", { tokenId });
        navigation.replace(ScreenNames.VideoPlayer, {
          tokenId,
          nft: payload,
          commentId,
        });
      } else {
        // Feed post → replace with FeedDetail
        logger.info("Resolved as feed", { tokenId });
        navigation.replace(ScreenNames.FeedDetail, {
          tokenId,
          commentId,
        });
      }
    } catch (err) {
      logger.error("Failed to resolve post type — falling back to FeedDetail", { tokenId, err });
      // Fallback: try FeedDetail (it handles its own error states)
      navigation.replace(ScreenNames.FeedDetail, {
        tokenId,
        commentId,
      });
    }
  }, [tokenId, commentId, navigation]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return (
    <View className="flex-1 bg-black items-center justify-center">
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
};

export default PostResolverScreen;
