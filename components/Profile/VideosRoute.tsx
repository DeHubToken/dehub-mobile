import React from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import CompactVideoInfiniteList from '../Home/CompactVideoInfiniteList';
import { useCinematicPhone } from '../../hooks/useCinematicPhone';
import { ProfileFeedOriginContext, useProvidedProfileFeed } from '../../libs/profileFeedOrigin';
import type { FeedRange, FeedSortBy } from '../../services/feed.unified.service';

// Fallback address provided
const FALLBACK_ADDRESS = '0x4B12Ca78C722253cd174Db212E2122b1E635a18A';

interface VideosRouteProps {
  /** Channel toolbar state, threaded to the API rather than applied on screen. */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  category?: string;
  range?: string;
  isPPV?: boolean;
  hasBounty?: boolean;
  isLocked?: boolean;
  address?: string;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  showCreator?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
}

const VideosRoute: React.FC<VideosRouteProps> = ({
  address,
  listRef,
  showCreator = true,
  onScroll,
  listHeader,
  onBeforeNavigate,
  sortBy,
  sortOrder,
  search,
  category,
  range,
  isPPV,
  hasBounty,
  isLocked,
}) => {
  const cinematicPhone = useCinematicPhone();
  // A video opened here plays on through this creator's videos in Shorts.
  const feedSource = useProvidedProfileFeed(address ? {
    minter: address,
    postType: "video",
    sortBy: sortBy as FeedSortBy | undefined,
    sortOrder,
    search,
    category,
    range: range as FeedRange | undefined,
    isPPV,
    hasBounty,
    isLocked,
  } : null);
  return (
    <ProfileFeedOriginContext.Provider value={feedSource}>
    <CompactVideoInfiniteList
      cinematic={cinematicPhone && !!listHeader}
      listRef={listRef}
      address={address || FALLBACK_ADDRESS}
      bottomPadding={80}
      showCreator={showCreator}
      enablePreview={false}
      onScroll={onScroll}
      ListHeaderComponent={listHeader}
      onBeforeNavigate={onBeforeNavigate}
      sortBy={sortBy}
      sortOrder={sortOrder}
      search={search}
      category={category}
      range={range}
      isPPV={isPPV}
      hasBounty={hasBounty}
      isLocked={isLocked}
    />
    </ProfileFeedOriginContext.Provider>
  );
};

export default VideosRoute;
