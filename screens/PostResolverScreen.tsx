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
import { ScreenNames } from "../navigation/ScreenNames";
import { resolveNewPost } from "../services/nft.service";
import { createLogger } from "../libs/logger";

const logger = createLogger("PostResolver");

const PostResolverScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const tokenId: string | undefined =
    route.params?.tokenId ?? route.params?.postId ?? route.params?.id;
  /** dehub.io/newpost/:n — an off-chain post's own slug, resolved via the API. */
  const newPostId: string | undefined = route.params?.newPostId;
  const commentId: string | undefined =
    route.params?.commentId ?? route.params?.c;

  // Root already sits at the bottom of this stack. Replacing the resolver with
  // a second Root mounted the whole tab tree twice — two home feeds fetching
  // and scrolling under one another. Pop back to the one that exists.
  const goHome = useCallback(() => {
    if (navigation.canGoBack()) navigation.popToTop();
    else navigation.replace(ScreenNames.Root);
  }, [navigation]);

  const resolve = useCallback(async () => {
    // The slug carries no tokenId, and everything downstream keys on one.
    // Resolving also survives the post minting later, since the server keeps
    // the mapping — the link never dies.
    if (!tokenId && newPostId) {
      logger.info("Resolving /newpost slug", { newPostId });
      const resolved = await resolveNewPost(newPostId);
      if (resolved) {
        navigation.replace(ScreenNames.FeedDetail, {
          tokenId: String(resolved.tokenId),
          commentId,
        });
      } else {
        logger.warn("Slug did not resolve — going home", { newPostId });
        goHome();
      }
      return;
    }

    if (!tokenId) {
      logger.warn("No tokenId — going home");
      goHome();
      return;
    }

    logger.info("Resolving to FeedDetail", { tokenId });
    navigation.replace(ScreenNames.FeedDetail, {
      tokenId,
      commentId,
    });
  }, [tokenId, newPostId, commentId, navigation, goHome]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return (
    <View className="flex-1 bg-black items-center justify-center">
      <ActivityIndicator size="large" color="#F4F4F5" />
    </View>
  );
};

export default PostResolverScreen;
