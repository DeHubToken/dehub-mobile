// Stream / access validation utilities
//
// Server-first approach (YouTube / Netflix pattern):
// - `isOwner` from API → owner always bypasses all locks
// - `isUnlocked` from API → source of truth for PPV unlock status
// - Lock-content uses cross-chain aggregated balance (wallet + staked) locally
// - After on-the-spot PPV payment, caller re-fetches and the hook auto-recomputes

import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import {
  supportedTokens,
  supportedTokensForLockContent,
  defaultChainId as DEFAULT_CHAIN_ID,
  defaultTokenSymbol as DEFAULT_TOKEN_SYMBOL,
  ChainId,
} from "../config/constants";
import type { User } from "../context/AuthContext";
import { streamInfoKeys } from "../config/constants";

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
  /** Server-provided: true when the authenticated user is the content creator */
  isOwner?: boolean;
  /** Server-provided: true when the authenticated user has already unlocked PPV */
  isUnlocked?: boolean;
  [key: string]: any; // allow forward compatibility
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

// ---------------------------------------------------------------------------
// Core access computation — server-first, locally augmented
// ---------------------------------------------------------------------------
const computeStreamAccessInfo = (
  nftMetadata: NFTMetadataLike | null | undefined,
  userInfo: UserInfoLite | null,
  chainId: number
): StreamAccessResult => {
  // No metadata → nothing to resolve
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

  // ----- 1. Owner bypass — owners always see their own content -----
  if (nftMetadata.isOwner === true) {
    return {
      streamStatus,
      lockTokenWithLockContent: null,
      ppvToken: null,
      playableVideoUrl: nftMetadata.videoUrl || null,
    };
  }

  // ----- 2. Lock-content check (threshold-based, cross-chain) -----
  if (info?.isLockContent) {
    streamStatus.isFree = false;

    if (!userInfo?.balanceData?.length) {
      // Not signed in / no balance data → locked
      streamStatus.isLockedWithLockContent = true;
    } else {
      const targetSymbol = info.lockContentTokenSymbol || DEFAULT_TOKEN_SYMBOL;
      const needed = Number(info.lockContentAmount || 0);

      // Aggregate wallet + staked across ALL chains for the target token
      let totalBalance = 0;
      userInfo.balanceData.forEach((entry) => {
        const tokenItem = supportedTokensForLockContent.find(
          (t) =>
            t.address.toLowerCase() === entry.tokenAddress &&
            t.chainId === entry.chainId
        );
        if (!tokenItem || tokenItem.symbol !== targetSymbol) return;
        totalBalance += (entry.walletBalance || 0) + (entry.staked || 0);
      });

      streamStatus.isLockedWithLockContent = totalBalance < needed;
    }

    // Resolve lock token on the active chain for UI display
    lockTokenWithLockContent =
      supportedTokens.find(
        (t) =>
          t.chainId === chainId &&
          t.symbol === (info.lockContentTokenSymbol || DEFAULT_TOKEN_SYMBOL)
      ) || null;
  }

  // ----- 3. PPV check — trust the server's isUnlocked flag -----
  if (info?.isPayPerView) {
    streamStatus.isFree = false;

    // Server says unlocked → user paid or was granted access
    if (nftMetadata.isUnlocked === true) {
      streamStatus.isLockedWithPPV = false;
    } else {
      streamStatus.isLockedWithPPV = true;
    }

    // Resolve PPV token for the payment UI
    ppvToken =
      supportedTokens.find(
        (t) =>
          t.chainId === chainId &&
          t.symbol === (info.payPerViewTokenSymbol || DEFAULT_TOKEN_SYMBOL)
      ) || null;
  }

  // ----- 4. Derive playable URL -----
  const isPlayable =
    !streamStatus.isLockedWithLockContent && !streamStatus.isLockedWithPPV;
  const playableVideoUrl = isPlayable ? nftMetadata.videoUrl || null : null;

  return { streamStatus, lockTokenWithLockContent, ppvToken, playableVideoUrl };
};

// Hook wrapper — builds UserInfoLite from auth context, delegates to pure fn
export const useStreamAccessInfo = (
  nftMetadata: NFTMetadataLike | null | undefined
): StreamAccessResult => {
  const { user, chainId } = useAuth();
  return useMemo(() => {
    // Prefer server-provided balanceData (per-chain wallet + staked).
    // Fall back to local tokenBalances if server data is missing.
    const balanceData: UserBalanceEntry[] =
      user?.balanceData?.length
        ? user.balanceData.map((e) => ({
            chainId: e.chainId,
            tokenAddress: (e.tokenAddress || "").toLowerCase(),
            walletBalance: e.walletBalance || 0,
            staked: e.staked || 0,
          }))
        : supportedTokens.map((t) => ({
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

// ---------------- Upload/Mint Validation ----------------
export const lockAmountMin = 0.001;
export const bountyAmountMin = 0.001;

export const getTotalBountyAmount = (
  streamInfo: Record<string, any>,
): number => {
  const amt = Number(streamInfo?.[streamInfoKeys.addBountyAmount] || 0) || 0;
  const viewers = Number(streamInfo?.[streamInfoKeys.addBountyFirstXViewers] || 0) || 0;
  const comments = Number(streamInfo?.[streamInfoKeys.addBountyFirstXComments] || 0) || 0;
  return amt * (viewers + comments);
};

export const isValidDataForMinting = (
  title: string,
  description: string,
  streamInfo: Record<string, string | number | boolean>,
  user: User | null,
  tokenBalances: any
) => {
  const t = String(title || "").trim();
  const d = String(description || "").trim();
  if (t.length < 3) return { isError: true, error: "Title is too short" };
  if (d.length < 3) return { isError: true, error: "Description is too short" };

  if (streamInfo[streamInfoKeys.isLockContent]) {
    let errorKey = "";
    const amount = Number(streamInfo[streamInfoKeys.lockContentAmount] || 0);
    if (!amount) errorKey = "Amount";
    if (!streamInfo[streamInfoKeys.lockContentChainIds]) errorKey = "Network";
    if (!streamInfo[streamInfoKeys.lockContentTokenSymbol]) errorKey = "Token";
    if (errorKey)
      return {
        isError: true,
        error: `${errorKey} for lock content is invalid!`,
        errorKey: streamInfoKeys.lockContentAmount,
      };
    if (amount < lockAmountMin)
      return {
        isError: true,
        error: "Amount for lock content is too small!",
        errorKey: streamInfoKeys.lockContentAmount,
      };
  }

  if (streamInfo[streamInfoKeys.isPayPerView]) {
    let errorKey = "";
    const amount = Number(streamInfo[streamInfoKeys.payPerViewAmount] || 0);
    if (!amount) errorKey = "Amount";
    if (!streamInfo[streamInfoKeys.payPerViewChainIds]) errorKey = "Network";
    if (!streamInfo[streamInfoKeys.payPerViewTokenSymbol]) errorKey = "Token";
    if (errorKey)
      return {
        isError: true,
        error: `${errorKey} for pay per view is invalid!`,
        errorKey: streamInfoKeys.payPerViewAmount,
      };
  }

  if (streamInfo[streamInfoKeys.isAddBounty]) {
    let errorKey = "";
    const amount = Number(streamInfo[streamInfoKeys.addBountyAmount] || 0);
    if (!amount) errorKey = "Amount";
    if (!streamInfo[streamInfoKeys.addBountyChainId]) errorKey = "Network";
    if (!streamInfo[streamInfoKeys.addBountyTokenSymbol]) errorKey = "Token";
    if (errorKey)
      return {
        isError: true,
        error: `${errorKey} for bounty is invalid!`,
        errorKey: streamInfoKeys.addBountyAmount,
      };

    const addBountyToken = supportedTokens.find(
      (e) =>
        e.symbol === streamInfo[streamInfoKeys.addBountyTokenSymbol] &&
        e.chainId === streamInfo[streamInfoKeys.addBountyChainId]
    );
    const addBountyTotalAmount = getTotalBountyAmount(streamInfo as any);
    if (!addBountyToken) {
      return {
        isError: true,
        error: "Token or Chain is not selected!",
        errorKey: streamInfoKeys.addBountyTokenSymbol,
      };
    }

    if (!addBountyTotalAmount || addBountyTotalAmount < bountyAmountMin) {
      return {
        isError: true,
        error: "You need to input correct bounty amount!",
        errorKey: addBountyToken.symbol,
      };
    }

    // Mobile tokenBalances may be by symbol; accept both address and symbol keys.
    const balanceByAddress = tokenBalances?.[addBountyToken.address] ?? undefined;
    const symbolKey = addBountyToken.symbol;
    const balanceBySymbol = (user as any)?.tokenBalances?.[symbolKey];
    const bountyTokenBalance = Number(balanceByAddress ?? balanceBySymbol ?? 0);
    if (bountyTokenBalance < addBountyTotalAmount) {
      return {
        isError: true,
        error: `You need to have enough token balance to add bounty!\n You balance is ${bountyTokenBalance} ${addBountyToken.symbol}`,
        errorKey: addBountyToken.symbol,
      };
    }
  }
  return { isError: false };
};

// ---------------- Upload helpers ----------------
export const filteredStreamInfo = (info: Record<string, any> | null | undefined) => {
  const src = { ...(info || {}) } as Record<string, any>;
  const clean = (obj: Record<string, any>) => {
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      if (v === undefined || v === null || v === "") delete obj[k];
    });
  };
  if (!src[streamInfoKeys.isLockContent]) {
    delete src[streamInfoKeys.lockContentAmount];
    delete src[streamInfoKeys.lockContentTokenSymbol];
    delete src[streamInfoKeys.lockContentChainIds];
    delete src[streamInfoKeys.lockContentContractAddress];
  }
  if (!src[streamInfoKeys.isPayPerView]) {
    delete src[streamInfoKeys.payPerViewAmount];
    delete src[streamInfoKeys.payPerViewTokenSymbol];
    delete src[streamInfoKeys.payPerViewChainIds];
    delete src[streamInfoKeys.payPerViewContractAddress];
  }
  if (!src[streamInfoKeys.isAddBounty]) {
    delete src[streamInfoKeys.addBountyAmount];
    delete src[streamInfoKeys.addBountyTokenSymbol];
    delete src[streamInfoKeys.addBountyChainId];
    delete src[streamInfoKeys.addBountyFirstXViewers];
    delete src[streamInfoKeys.addBountyFirstXComments];
  }
  clean(src);
  return src;
};
