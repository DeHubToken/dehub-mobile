import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useProfilePins } from '../../hooks/usePinnedPosts';
import InfiniteFeed, { type InfiniteFeedRenderItemInfo } from '../Feed/InfiniteFeed';
import { getUnifiedFeed, type FeedPostType, type FeedRange, type FeedSortBy, type UnifiedFeedItem } from '../../services/feed.unified.service';
import { getNFT, type GetNFTsResponse, type GetNFTsResult } from '../../services/nft.service';
import { useAuthState } from '../../context/AuthContext';
import { useUser } from '../../context/AuthContext';
import { getMyPosts } from '../../services/user.service';
import ProfileEmptyState from './ProfileEmptyState';
import ProfileGridTile, { gridTileKind } from './ProfileGridTile';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';
import { seedPostDetail, warmRequest } from '../../libs/navPrefetch';
import { noteProfileFeedOpen, useProvidedProfileFeed } from '../../libs/profileFeedOrigin';
import { useProfilePostBg } from './PostBackground';
import FeedCard from '../Home/FeedCard';
import FeedCardSkeleton from '../Feed/FeedCardSkeleton';
import Icon from '../ui/Icon';
import { isReelSlide } from '../../libs/profileReel';
import { useProfileViewMode } from '../../libs/profileViewMode';

// One recycle pool per tile kind: photo, video, text and song tiles draw different trees.
const gridItemTypeOf = (item: any) => gridTileKind(item as UnifiedFeedItem);

interface FeedRouteProps {
  /** Channel toolbar state, threaded to the API rather than applied on screen. */
  sortBy?: FeedSortBy;
  sortOrder?: "asc" | "desc";
  search?: string;
  category?: string;
  range?: FeedRange;
  postType?: FeedPostType;
  isPPV?: boolean;
  hasBounty?: boolean;
  isLocked?: boolean;
  address?: string;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  /** Profile header rendered as the scrollable list header (banner, info, tabs). */
  listHeader?: React.ReactNode;
  onBeforeNavigate?: () => void;
  /** Either a plain callback, or a Reanimated worklet scroll handler (InfiniteFeed accepts both). */
  onScroll?: ((event: NativeSyntheticEvent<NativeScrollEvent>) => void) | any;
  scrollEnabled?: boolean;
}

/**
 * Profile "All" tab — every piece of the user's own content (text, images,
 * videos, audio), matching the web profile's home feed. Uses the unified feed
 * with no postType filter (the `feed-all` postType returns nothing for a
 * minter-scoped query).
 */
/** Two rows of empty tiles while the first page loads. */
function GridSkeleton() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1 }}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={{ width: '33.333%', aspectRatio: 3 / 4, padding: 1 }}>
          <View className="flex-1 rounded-[3px] bg-white/5" />
        </View>
      ))}
    </View>
  );
}

const FeedRoute: React.FC<FeedRouteProps> = ({
  address,
  listRef,
  listHeader,
  onBeforeNavigate,
  onScroll,
  scrollEnabled = true,
  sortBy,
  sortOrder,
  search,
  category,
  range,
  postType,
  isPPV,
  hasBounty,
  isLocked,
}) => {
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const user = useUser() as any;
  const ownAddress = user?.walletAddress || user?.address;
  const isOwnProfile = !!(
    address && ownAddress && address.toLowerCase() === ownAddress.toLowerCase()
  );

  const isDefaultView =
    (sortBy ?? 'createdAt') === 'createdAt' &&
    (sortOrder ?? 'desc') === 'desc' &&
    !search && !category && !range && !postType &&
    !isPPV && !hasBounty && !isLocked;

  // Pinned posts sit at the top of All, newest pin first, like a pinned post
  // anywhere else. A sorted or filtered view is a search, so they stay out.
  const { data: pins } = useProfilePins(address);
  const pinnedPosts = isDefaultView ? (pins || []) : [];
  const navigation = useNavigation<any>();
  // A post opened here continues into the rest of this list on its page.
  const feedSource = useProvidedProfileFeed(address ? {
    minter: address, postType, sortBy, sortOrder, search, category, range, isPPV, hasBounty, isLocked,
  } : null);

  // A tile opens the profile reel: this creator's posts one by one, full
  // screen, from the tapped one (libs/profileReel). Likes, comments and share
  // ride along on every slide; a still slide links on to its post page.
  const postBg = useProfilePostBg();
  const openTile = useCallback((item: UnifiedFeedItem, _kind?: unknown, images?: string[]) => {
    const tokenId = item.tokenId ?? item.id;
    if (tokenId == null) return;
    onBeforeNavigate?.();
    seedPostDetail(tokenId, item);
    warmRequest(`nft:${tokenId}`, () => getNFT(tokenId as any));
    const origin = noteProfileFeedOpen(feedSource, tokenId);
    // A live stream, or a post with nothing the reel can draw, opens its own
    // page: the reel would show a black slide that looks like a dead tap.
    if (!origin || !isReelSlide(item as any)) {
      navigation.navigate(ScreenNames.FeedDetail, { postId: String(tokenId) });
      return;
    }
    navigation.navigate(ScreenNames.ShortsViewer, {
      initialIndex: 0,
      initialItems: [item],
      initialThumbnail: images?.[0],
      feedParams: { profileFeed: origin, fromId: String(tokenId), reel: true, reelBgId: postBg?.id ?? null },
    });
  }, [navigation, onBeforeNavigate, feedSource, postBg]);

  const viewMode = useProfileViewMode();
  const isList = viewMode === 'list';

  // Pinned posts lead the grid as their own row of tiles, wearing a Pinned chip.
  // In the list they lead as full cards under a small Pinned line.
  const header = pinnedPosts.length && isList ? (
    <>
      {listHeader}
      {pinnedPosts.map((item) => (
        <View key={`pinned-${item.tokenId}`} className="px-2">
          <View className="flex-row items-center gap-1.5 px-2 pt-2 pb-1">
            <Icon name="Pin" size={14} color="#9CA3AF" />
            <Text className="text-xs text-theme-neutrals-400">{t("profile.tabPinned", "Pinned")}</Text>
          </View>
          <FeedCard
            item={item as UnifiedFeedItem}
            isVisible
            isAutoplayActive={false}
            onBeforeNavigate={onBeforeNavigate}
          />
        </View>
      ))}
    </>
  ) : pinnedPosts.length ? (
    <>
      {listHeader}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1 }}>
        {pinnedPosts.map((item) => (
          <View key={`pinned-${item.tokenId}`} style={{ width: '33.333%' }}>
            <ProfileGridTile item={item as UnifiedFeedItem} pinned onPress={openTile} ownerHold={isOwnProfile} />
          </View>
        ))}
      </View>
    </>
  ) : listHeader;

  const fetchPage = useCallback(
    async (page: number, limit: number): Promise<GetNFTsResponse> => {
      if (!address) return { result: [] };
      const isDefaultView =
        (sortBy ?? 'createdAt') === 'createdAt' &&
        (sortOrder ?? 'desc') === 'desc' &&
        !search && !category && !range && !postType &&
        !isPPV && !hasBounty && !isLocked;
      // The public feed correctly withholds future posts. On the creator's
      // own unfiltered profile use the authenticated list, which includes
      // scheduled posts so a successful schedule never appears to vanish.
      if (isOwnProfile && isDefaultView) {
        return getMyPosts({ page, unit: limit });
      }
      const res = await getUnifiedFeed({
        minter: address,
        sortBy: sortBy ?? 'createdAt',
        sortOrder: sortOrder ?? 'desc',
        search: search || undefined,
        category: category || undefined,
        range,
        // Sent only for a type the deployed API already knows: an unrecognised
        // postType is answered with an unfiltered feed rather than an error.
        postType: postType && postType !== 'all' ? postType : undefined,
        // Only ever true — `false` would exclude free posts rather than widen.
        isPPV: isPPV || undefined,
        hasBounty: hasBounty || undefined,
        isLocked: isLocked || undefined,
        // 'all' resolves to minted+signed server-side; 'minted' alone hides
        // off-chain (mint-opt-out) posts from their own author's profile.
        status: 'all',
        page: page + 1, // /feed uses 1-indexed pages
        limit,
      });
      return { result: res.result as unknown as GetNFTsResult[] };
    },
    [address, sortBy, sortOrder, search, category, range, postType, isPPV, hasBounty, isLocked, isOwnProfile],
  );

  // Stable identity: InfiniteFeed's own renderItem useCallback lists this in
  // its deps, so a fresh arrow per render invalidated it and re-rendered every
  // cell in the window on any re-render of this route.
  const renderItem = useCallback(
    ({ item }: InfiniteFeedRenderItemInfo) => (
      <ProfileGridTile item={item as UnifiedFeedItem} onPress={openTile} ownerHold={isOwnProfile} />
    ),
    [openTile, isOwnProfile],
  );
  // isVisible must be forwarded or FeedCard falls back to its own `true`
  // default and every windowed row attaches a video player.
  const renderListItem = useCallback(
    ({ item, isVisible, isAutoplayActive }: InfiniteFeedRenderItemInfo) => (
      <View className="px-2">
        <FeedCard
          item={item as UnifiedFeedItem}
          isVisible={isVisible}
          isAutoplayActive={isAutoplayActive}
          onBeforeNavigate={onBeforeNavigate}
        />
      </View>
    ),
    [onBeforeNavigate],
  );

  return (
    <View className="flex-1">
      <InfiniteFeed
        // Grid and list lay rows out differently (3 columns vs 1): a fresh
        // list for each, reading the same cached pages.
        key={viewMode}
        listRef={listRef}
        insideNavigatorScreen={false}
        // Everything fetchPage closes over has to be in here: InfiniteFeed
        // reads fetchPage through a ref, so a key that omits the toolbar state
        // keeps serving the first sort/search/filter the tab was ever opened
        // with.
        cacheKey={[
          "profile-feed-all",
          address ?? "",
          sortBy ?? "createdAt",
          sortOrder ?? "desc",
          search ?? "",
          category ?? "",
          range ?? "",
          postType ?? "all",
          isPPV ? "ppv" : "",
          hasBounty ? "bounty" : "",
          isLocked ? "locked" : "",
        ]}
        fetchPage={fetchPage}
        // 10 fill the first screen; the next page waits until the visitor
        // scrolls within about half a screen of the end.
        pageSize={10}
        endReachedThreshold={0.6}
        isSignedIn={isSignedIn}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 0, paddingHorizontal: isList ? 0 : 1 }}
        numColumns={isList ? undefined : 3}
        gridItemType={isList ? undefined : gridItemTypeOf}
        enableBackToTop={false}
        headerComponent={header}
        loadingComponent={isList ? <View className="px-2"><FeedCardSkeleton count={3} /></View> : <GridSkeleton />}
        onScroll={onScroll}
        scrollEnabled={scrollEnabled}
        emptyComponent={(
          <ProfileEmptyState
            kind="home"
            title={t("profile.noPostsYet")}
            subtitle={t("profile.noPostsYetSub")}
          />
        )}
        renderItem={isList ? renderListItem : renderItem}
      />
    </View>
  );
};

export default FeedRoute;
