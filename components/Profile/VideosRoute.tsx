import React from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import CompactVideoInfiniteList from '../Home/CompactVideoInfiniteList';

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
  showCreator?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
  onBeforeNavigate?: () => void;
}

const VideosRoute: React.FC<VideosRouteProps> = ({
  address,
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
  return (
    <CompactVideoInfiniteList
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
  );
};

export default VideosRoute;
