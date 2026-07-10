import React from 'react';
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import CompactVideoInfiniteList from '../Home/CompactVideoInfiniteList';

// Fallback address provided
const FALLBACK_ADDRESS = '0x4B12Ca78C722253cd174Db212E2122b1E635a18A';

interface VideosRouteProps {
  address?: string;
  showCreator?: boolean;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactElement | null;
}

const VideosRoute: React.FC<VideosRouteProps> = ({ address, showCreator = true, onScroll, listHeader }) => {
  return (
    <CompactVideoInfiniteList address={address || FALLBACK_ADDRESS} bottomPadding={80} showCreator={showCreator} onScroll={onScroll} ListHeaderComponent={listHeader} />
  );
};

export default VideosRoute;
