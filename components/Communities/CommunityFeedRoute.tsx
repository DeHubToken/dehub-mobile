import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import InfiniteFeed, { type InfiniteFeedRenderItemInfo } from "../Feed/InfiniteFeed";
import FeedCard from "../Home/FeedCard";
import { getFeedNFTs } from "../../services/feed.service";
import type { GetNFTsResponse, GetNFTsResult } from "../../services/nft.service";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";
import { useAuthState } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";

interface Props {
  communitySlug: string;
  memberAddresses: Set<string>;
  isMember: boolean;
  listHeader?: React.ReactNode;
}

/**
 * Community posts feed — fetches posts tagged with the community slug (category)
 * and filters to member-only posts, matching the web CommunityFeed.
 */
const CommunityFeedRoute: React.FC<Props> = ({
  communitySlug,
  memberAddresses,
  isMember,
  listHeader,
}) => {
  const { isSignedIn } = useAuthState();
  const { t } = useTranslation();
  const [memberFilterReady, setMemberFilterReady] = useState(false);

  useEffect(() => {
    setMemberFilterReady(true);
  }, [memberAddresses]);

  const fetchPage = useCallback(
    async (page: number, unit: number): Promise<GetNFTsResponse> => {
      const res = await getFeedNFTs({
        category: communitySlug,
        unit,
        page,
        sortMode: "new",
      });
      const filtered = (res.result || []).filter((item) => {
        const minter = (item.minter || (item as any).minterUser?.address || "").toLowerCase();
        return !minter || memberAddresses.has(minter);
      });
      return { result: filtered as GetNFTsResult[] };
    },
    [communitySlug, memberAddresses],
  );

  // Stable digest of the roster for the feed's cache key. Sorted so an
  // insertion-order change alone doesn't invalidate the cache.
  const memberKey = useMemo(
    () => Array.from(memberAddresses).sort().join(","),
    [memberAddresses],
  );

  const emptyComponent = useMemo(
    () => (
      <View className="items-center py-10 px-6">
        <Text className="text-theme-neutrals-400 text-sm text-center">
          {isMember
            ? t("communities.noPostsYet", "No posts in this community yet.")
            : t("communities.joinToSeePosts", "Join the community to see member posts.")}
        </Text>
      </View>
    ),
    [isMember, t],
  );

  // Stable identity: InfiniteFeed's own renderItem useCallback lists this in
  // its deps, so a fresh arrow per render invalidated it and re-rendered every
  // cell in the window on any re-render of this route. Declared above the
  // memberFilterReady early return — it is a hook, so it has to run on every
  // render of this component.
  const renderItem = useCallback(
    ({ item, isVisible, isAutoplayActive }: InfiniteFeedRenderItemInfo) => (
      <FeedCard
        item={item as UnifiedFeedItem}
        isVisible={isVisible}
        isAutoplayActive={isAutoplayActive}
      />
    ),
    [],
  );

  if (!memberFilterReady) {
    return (
      <View className="py-12 items-center">
        <ActivityIndicator color="#F4F4F5" />
      </View>
    );
  }

  return (
    <View className="flex-1 px-4">
      <InfiniteFeed
        insideNavigatorScreen={false}
        // memberAddresses is applied as a client-side filter inside fetchPage,
        // so it belongs in the key too — otherwise a membership change would
        // keep serving pages filtered against the old roster.
        cacheKey={["community-feed", communitySlug, memberKey]}
        fetchPage={fetchPage}
        pageSize={20}
        isSignedIn={isSignedIn}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 8 }}
        enableBackToTop={false}
        headerComponent={listHeader}
        emptyComponent={emptyComponent}
        // isVisible must be forwarded or FeedCard falls back to its own
        // `true` default and every windowed row attaches a video player.
        renderItem={renderItem}
      />
    </View>
  );
};

export default CommunityFeedRoute;
