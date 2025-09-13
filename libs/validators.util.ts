// Stream / access validation utilities
// Refactored: now exposes a React hook `getStreamAccessInfo` (alias to `useStreamAccessInfo`)
// which internally pulls supported tokens & defaults from constants and user / chainId from AuthContext.
// The pure computation is kept internal for testability.

import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  supportedTokens,
  supportedTokensForLockContent,
  defaultChainId as DEFAULT_CHAIN_ID,
  defaultTokenSymbol as DEFAULT_TOKEN_SYMBOL,
  ChainId,
} from "../config/constants";

export interface UserBalanceEntry {
  chainId: number;
  tokenAddress: string; // lowercase expected
  walletBalance?: number;
  staked?: number;
}

export interface UserInfoLite {
  walletAddress?: string;
  address?: string;
  username?: string;
  balanceData?: UserBalanceEntry[];
  unlocked?: any; // list of unlocked tokenIds (for PPV)
}

export interface SupportedToken {
  address: string; // lowercase
  symbol: string;
  chainId: number;
  decimals?: number;
}

export interface StreamStatus {
  isFree: boolean;
  isLockedWithLockContent: boolean;
  isLockedWithPPV: boolean;
  errMsg: string;
}

export interface StreamInfoShape {
  isLockContent?: boolean;
  lockContentChainIds?: number | number[];
  lockContentTokenSymbol?: string;
  lockContentAmount?: string | number;
  isPayPerView?: boolean;
  payPerViewTokenSymbol?: string;
  payPerViewAmount?: string | number;
  // other fields ignored for now
}

export interface NFTMetadataLike {
  tokenId?: string | number;
  minter?: string;
  description?: string;
  views?: number;
  tips?: number;
  createdAt?: string | number | Date;
  streamInfo?: StreamInfoShape;
  videoUrl?: string; // direct URL for free streams
  // any other dynamic properties ignored
}

// (Deprecated) Kept for backward compatibility types only. No longer used externally.
export interface GetStreamAccessParamsLegacy {
  nftMetadata: NFTMetadataLike | null | undefined;
  userInfo: UserInfoLite | null;
  chainId: number;
  supportedTokens: SupportedToken[];
  supportedTokensForLockContent: SupportedToken[];
  defaultChainId: number;
  defaultTokenSymbol: string;
}

export interface StreamAccessResult {
  streamStatus: StreamStatus | null;
  lockTokenWithLockContent: SupportedToken | null;
  ppvToken: SupportedToken | null;
  playableVideoUrl: string | null; // only if free
}

// Helper to derive maximum staked amount across balanceData entries
export const maxStacked = (balanceData: any): number => {
  return (
    balanceData?.reduce(
      (max: number, item: any) => Math.max(max, item?.staked || 0),
      0
    ) ?? 0
  );
};

const toArray = <T>(v: T | T[] | undefined): T[] =>
  Array.isArray(v) ? v : v === undefined ? [] : [v];

// Internal pure computer. Uses imported constants.
const computeStreamAccessInfo = (
  nftMetadata: NFTMetadataLike | null | undefined,
  userInfo: UserInfoLite | null,
  chainId: number
): StreamAccessResult => {
  if (!nftMetadata)
    return {
      streamStatus: null,
      lockTokenWithLockContent: null,
      ppvToken: null,
      playableVideoUrl: null,
    };

  const streamStatus: StreamStatus = {
    isFree: true,
    isLockedWithLockContent: false,
    isLockedWithPPV: false,
    errMsg: "",
  };
  let lockTokenWithLockContent: SupportedToken | null = null;
  let ppvToken: SupportedToken | null = null;
  const info = nftMetadata.streamInfo;

  if (info?.isLockContent) {
    const chainIdsRaw = info.lockContentChainIds ?? DEFAULT_CHAIN_ID;
    const supportedChainIds = toArray(chainIdsRaw);
    streamStatus.isFree = false;
    if (!userInfo?.balanceData?.length) {
      streamStatus.isLockedWithLockContent = true;
    } else {
      //   streamStatus.isLockedWithLockContent = true;
      const targetSymbol = info.lockContentTokenSymbol || DEFAULT_TOKEN_SYMBOL;
      let baseWalletBalance = 0;
      let baseStaked = 0;
      let bscStaked = 0;
      // (Optional variables for commented alternative calculations)
      let bscWalletBalance = 0;
      userInfo.balanceData.forEach((entry) => {
        // if (!supportedChainIds.includes(entry.chainId)) return;
        const tokenItem = supportedTokensForLockContent.find(
          (token) =>
            token.address.toLowerCase() === entry.tokenAddress &&
            token.chainId === entry.chainId
        );
        if (!tokenItem || tokenItem.symbol !== targetSymbol) return;
        if (entry.chainId === ChainId.BASE_MAINNET) {
          baseWalletBalance = entry.walletBalance || 0;
          baseStaked = entry.staked || 0;
        } else if (entry.chainId === ChainId.BSC_MAINNET) {
          bscStaked = entry.staked || 0;
          bscWalletBalance = entry.walletBalance || 0; // captured for alternative variants
        }
      });
      // Primary rule (new one): base wallet + bsc staked
      const lockedTokenBalance = baseWalletBalance + bscStaked;
      // Primary rule (requested): base wallet + base staked + bsc staked
      //   const lockedTokenBalance = baseWalletBalance + baseStaked + bscStaked;
      // Alternative variant 1 (commented): base wallet + base staked only
      // const lockedTokenBalanceBaseOnly = baseWalletBalance + baseStaked;
      // Alternative variant 2 (commented): all four (base+bsc wallet + base+bsc staked)
      // const lockedTokenBalanceAllFour = baseWalletBalance + baseStaked + bscWalletBalance + bscStaked;
      const needed = Number(info.lockContentAmount || 0);
      if (lockedTokenBalance >= needed)
        streamStatus.isLockedWithLockContent = false;
      else streamStatus.isLockedWithLockContent = true;
    }
    lockTokenWithLockContent =
      supportedTokens.find(
        (t) =>
          t.chainId === DEFAULT_CHAIN_ID &&
          t.symbol === (info.lockContentTokenSymbol || DEFAULT_TOKEN_SYMBOL)
      ) || null;
  }
  if (info?.isPayPerView) {
    streamStatus.isFree = false;
    const tokenIdStr = String(nftMetadata.tokenId ?? "");
    const unlockedArray = userInfo?.unlocked || [];
    if (!unlockedArray.includes(tokenIdStr) && !unlockedArray.includes(Number(tokenIdStr))) {
      streamStatus.isLockedWithPPV = true;
    }
    ppvToken =
      supportedTokens.find(
        (t) =>
          t.chainId === DEFAULT_CHAIN_ID &&
          t.symbol === (info.payPerViewTokenSymbol || DEFAULT_TOKEN_SYMBOL)
      ) || null;
  }

  const playableVideoUrl = streamStatus.isFree
    ? nftMetadata.videoUrl || null
    : null;
  return { streamStatus, lockTokenWithLockContent, ppvToken, playableVideoUrl };
};

// New hook wrapper leveraging auth context & constants
export const useStreamAccessInfo = (
  nftMetadata: NFTMetadataLike | null | undefined
): StreamAccessResult => {
  const { user, chainId } = useAuth();
  return useMemo(() => {
    // Build userInfoLite from auth user (balanceData built from supportedTokensForLockContent)
    const balanceData = supportedTokens.map((t) => ({
      chainId: t.chainId,
      tokenAddress: t.address.toLowerCase(),
      walletBalance: (user as any)?.tokenBalances?.[t.symbol] || 0,
      staked: (user as any)?.stakedDHB || 0,
    }));
    const userInfo: UserInfoLite | null = user
      ? {
          walletAddress: user.walletAddress || user.address,
          address: user.address,
          username: (user as any)?.username,
          unlocked: (user as any)?.unlocked,
          balanceData,
        }
      : null;
    const activeChainId = chainId || DEFAULT_CHAIN_ID;
    return computeStreamAccessInfo(nftMetadata, userInfo, activeChainId);
  }, [nftMetadata, user, chainId]);
};

// Backwards compatible export name (components now treat it as a hook)
export const getStreamAccessInfo = useStreamAccessInfo;

export const isOwner = (
  nftMetadata: NFTMetadataLike | null | undefined,
  account: string | undefined | null
) => {
  if (!nftMetadata?.minter || !account) return false;
  return nftMetadata.minter.toLowerCase() === account.toLowerCase();
};

export default {
  getStreamAccessInfo,
  useStreamAccessInfo,
  isOwner,
  maxStacked,
};
