import React from 'react';
import CompactVideoInfiniteList from '../Home/CompactVideoInfiniteList';

const FALLBACK_ADDRESS = '0x4B12Ca78C722253cd174Db212E2122b1E635a18A';

interface LivestreamsRouteProps { address?: string }

const LivestreamsRoute: React.FC<LivestreamsRouteProps> = ({ address }) => (
  <CompactVideoInfiniteList
    address={address || FALLBACK_ADDRESS}
    variant="live"
    enablePreview={false}
    bottomPadding={80}
  />
);

export default LivestreamsRoute;
