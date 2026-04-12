import { apiClient } from "../libs";

export type FeedPostType = "video" | "feed-images" | "feed-simple" | "feed-audio" | "live" | "short" | "all";
export type FeedSortBy = "likes" | "views" | "createdAt" | "tips" | "comments" | "random";
export type FeedSortOrder = "asc" | "desc";
export type FeedRange = "day" | "week" | "month" | "year";
export type FeedStatus = "minted" | "signed" | "all";

export interface UnifiedFeedParams {
  // Pagination
  page?: number;
  limit?: number;
  
  // Sorting
  sortBy?: FeedSortBy;
  sortOrder?: FeedSortOrder;
  
  // Filters
  postType?: FeedPostType;
  category?: string;
  status?: FeedStatus;
  
  // Monetization filters
  isPPV?: boolean;
  isLocked?: boolean;
  hasBounty?: boolean;
  hasPlans?: boolean;
  
  // Time range
  range?: FeedRange;
  from?: string; // ISO 8601
  to?: string;   // ISO 8601
  
  // User filters
  minter?: string;  // Creator address
  owner?: string;   // Current owner address
  
  // Search
  search?: string;
}

export interface StreamInfo {
  isAddBounty?: boolean;
  addBountyAmount?: number;
  addBountyTokenSymbol?: string;
  isPayPerView?: boolean;
  payPerViewAmount?: number;
  payPerViewTokenSymbol?: string;
  isLockContent?: boolean;
  lockContentAmount?: number;
  lockContentTokenSymbol?: string;
  isLive?: boolean;
}

export interface MinterUser {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers?: number;
  followings?: number;
  sentTips?: number;
  receivedTips?: number;
  badgeBalance?: number;
  createdAt?: string;
}

export interface PlanDetail {
  id: number;
  title: string;
  price: number;
  alreadySubscribed?: boolean;
}

export interface UnifiedFeedItem {
  // Core identifiers
  tokenId?: number | string;
  id?: string;
  
  // Content
  name?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[]; // For multi-image posts
  thumbnailUrl?: string;
  videoUrl?: string;
  
  // Type & Status
  postType: "video" | "feed-images" | "feed-simple" | "feed-audio" | "live";
  status?: string;
  category?: string[];
  
  // Metrics
  views?: number;
  likes?: number;
  dislikes?: number;
  commentCount?: number;
  videoDuration?: number;
  
  // Audio-specific
  audioUrl?: string;
  audioDuration?: number;
  listens?: number;
  
  // Creator info
  minter?: string;
  owner?: string;
  minterUsername?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  minterAboutMe?: string;
  minterFollowers?: number;
  minterFollowings?: number;
  minterStaked?: number;
  minterUser?: MinterUser;
  
  // Monetization
  streamInfo?: StreamInfo;
  plansDetails?: PlanDetail[];
  
  // User interaction state (when address provided)
  isLiked?: boolean;
  isDisliked?: boolean;
  isSaved?: boolean;
  isOwner?: boolean;
  isUnlocked?: boolean;
  
  // Repost & Quote fields
  reposts?: number;
  quotes?: number;
  isReposted?: boolean;
  isQuotePost?: boolean;
  quotedTokenId?: number | null;
  quotedPost?: any;
  
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  
  // Allow additional fields
  [key: string]: any;
}

export interface FeedPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface UnifiedFeedResponse {
  status: boolean;
  result: UnifiedFeedItem[];
  pagination: FeedPagination;
}

function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  (Object.entries(obj) as [keyof T, any][]).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      (out as any)[k] = v;
    }
  });
  return out;
}

function objectToQueryString(obj?: Record<string, any>): string {
  if (!obj) return "";
  const entries = Object.entries(obj);
  if (!entries.length) return "";
  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `?${query}`;
}

/**
 * Fetch unified feed with mixed content types
 * 
 * @example
 * // Get most liked content
 * const feed = await getUnifiedFeed({ sortBy: 'likes' });
 * 
 * // Get newest videos only
 * const videos = await getUnifiedFeed({ postType: 'video', sortBy: 'createdAt' });
 * 
 * // Get feed with user context (uses auth token automatically)
 * const myFeed = await getUnifiedFeed();
 */
export async function getUnifiedFeed(
  params?: UnifiedFeedParams
): Promise<UnifiedFeedResponse> {
  const queryParams = removeUndefined({
    page: params?.page ?? 1,
    limit: params?.limit ?? 20,
    sortBy: params?.sortBy,
    sortOrder: params?.sortOrder,
    postType: params?.postType,
    category: params?.category,
    status: params?.status,
    isPPV: params?.isPPV,
    isLocked: params?.isLocked,
    hasBounty: params?.hasBounty,
    hasPlans: params?.hasPlans,
    range: params?.range,
    from: params?.from,
    to: params?.to,
    minter: params?.minter,
    owner: params?.owner,
    search: params?.search,
  });

  const query = objectToQueryString(queryParams);
  const url = `/feed${query}`;

  try {
    const res = await apiClient.get<UnifiedFeedResponse>(url, {
      isAuthRequired: true,
    });

    // Handle response
    if (res && typeof res === "object" && "result" in res) {
      return {
        status: res.status ?? true,
        result: res.result || [],
        pagination: res.pagination || {
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          totalCount: res.result?.length || 0,
          totalPages: 1,
          hasMore: false,
        },
      };
    }

    // Fallback for unexpected response shape
    return {
      status: false,
      result: [],
      pagination: {
        page: 1,
        limit: 20,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
      },
    };
  } catch (error: any) {
    console.error("[UnifiedFeed] Error fetching feed:", error?.message || error);
    throw error;
  }
}

// Items without postType are treated as videos (legacy format)
export function isVideoItem(item: UnifiedFeedItem): boolean {
  return !item.postType || item.postType === "video";
}

export function isLiveItem(item: UnifiedFeedItem): boolean {
  return item.postType === "live";
}

export function isImagePostItem(item: UnifiedFeedItem): boolean {
  return item.postType === "feed-images";
}

export function isTextPostItem(item: UnifiedFeedItem): boolean {
  return item.postType === "feed-simple";
}

export function isAudioPostItem(item: UnifiedFeedItem): boolean {
  return item.postType === "feed-audio";
}

export function isFeedPostItem(item: UnifiedFeedItem): boolean {
  return item.postType === "feed-images" || item.postType === "feed-simple" || item.postType === "feed-audio";
}

export default {
  getUnifiedFeed,
  isVideoItem,
  isLiveItem,
  isImagePostItem,
  isTextPostItem,
  isAudioPostItem,
  isFeedPostItem,
};
