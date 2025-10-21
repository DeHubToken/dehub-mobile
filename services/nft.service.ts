import { apiClient } from "../libs";
import { streamInfoKeys } from "../config/constants";

// ---------------- Types ----------------
export interface SearchParams {
  search?: string;
  q?: string; // alias
  sort?: string;
  sortMode?: string;
  range?: string | number;
  category?: string;
  address?: string; // viewer / current user address
  page?: number;
  postType?: string; // e.g. 'live', 'vod', 'clip'
  minter?: string;
  owner?: string;
  unit?: number; // page size
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

export interface VoteInfo { for?: number; against?: number; total?: number; }

export interface GetNFTsResult {
  id?: string;
  tokenId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  videoDuration?: number; // seconds
  createdAt: string;
  status?: string; // live, ended, etc.
  views?: number;
  totalViews?: number;
  likes?: number;
  totalVotes?: VoteInfo;
  minter?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  minterStaked?: number;
  streamInfo?: StreamInfo;
  [key: string]: any; // allow forward compatibility
}

export interface GetNFTsResponse { result: GetNFTsResult[]; [k: string]: any }

// ---------------- Internal Helpers ----------------
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  (Object.entries(obj) as [keyof T, any][]).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") (out as any)[k] = v;
  });
  return out;
}

function objectToGetParams(obj?: Record<string, any>): string {
  if (!obj) return "";
  const entries = Object.entries(obj);
  if (!entries.length) return "";
  const query = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `?${query}`;
}

// ---------------- Service ----------------
export async function getNFTs(params?: SearchParams): Promise<GetNFTsResponse> {
  const baseParams: Record<string, any> = {
    q: params?.search || params?.q,
    search: params?.search || params?.q,
    sort: params?.sort,
    unit: params?.unit ?? 40,
    range: params?.range,
    category: params?.category,
    address: params?.address,
    page: params?.page,
    postType: params?.postType,
    sortMode: params?.sortMode,
    minter: params?.minter,
    owner: params?.owner,
  };

  const query = objectToGetParams(removeUndefined(baseParams));
  const url = `/search_nfts${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: false });
    // Expected shape: { result: [] } but handle array fallback
    if (Array.isArray(res)) return { result: res } as GetNFTsResponse;
    if (res?.result && Array.isArray(res.result)) return res as GetNFTsResponse;
    // Fallback: attempt common keys
    if (Array.isArray(res?.data)) return { result: res.data };
    return { result: [] };
  } catch (e) {
    console.error("[NFTService] getNFTs error", e);
    throw e;
  }
}

// ---------------- Single NFT ----------------
export interface SingleNFTResponse { result: GetNFTsResult; [k: string]: any }

/**
 * Fetch a single NFT (video) by tokenId for a given viewer address.
 * Endpoint shape expected: /nft_info/{tokenId}?address={address}
 */
export async function getNFT(tokenId: number | string, address: string = ''): Promise<SingleNFTResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  const url = `/nft_info/${tokenId}?address=${encodeURIComponent(address || '')}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: false });
    // Normalize: ensure res.result exists and is object
    if (res?.result && !Array.isArray(res.result)) return res as SingleNFTResponse;
    if (res && !res.result) return { result: res } as SingleNFTResponse;
    throw new Error('Invalid single NFT response');
  } catch (e) {
    console.error('[NFTService] getNFT error', e);
    throw e;
  }
}

// Convenience paginated fetcher (simple wrapper)
export async function getNFTsPage(page: number, params?: Omit<SearchParams, 'page'>) {
  return getNFTs({ ...(params || {}), page });
}

// ---------------- Categories ----------------
let __categoriesCache: { at: number; data: string[] } | null = null;
const DEFAULT_CATEGORIES_TTL = 10 * 60 * 1000; // 10 minutes

export async function getCategories(): Promise<string[]> {
  try {
    const res = await apiClient.get<any>('/get_categories', { isAuthRequired: false });
    if (Array.isArray(res)) return res as string[];
    if (Array.isArray(res?.result)) return res.result as string[];
    if (Array.isArray(res?.data)) return res.data as string[];
    return [];
  } catch (e) {
    console.error('[NFTService] getCategories error', e);
    return [];
  }
}

/**
 * Cached categories with TTL. Set `forceRefresh` to bypass cache.
 */
export async function getCategoriesCached(options?: { ttlMs?: number; forceRefresh?: boolean }): Promise<string[]> {
  const ttlMs = options?.ttlMs ?? DEFAULT_CATEGORIES_TTL;
  const now = Date.now();
  if (!options?.forceRefresh && __categoriesCache && (now - __categoriesCache.at) < ttlMs) {
    return __categoriesCache.data;
  }
  const data = await getCategories();
  __categoriesCache = { at: now, data };
  return data;
}

// ---------------- Record View ----------------
/**
 * Record a view for a tokenId.
 * Requires the user to be signed in; apiClient will attach auth headers.
 */
export async function recordView(tokenId: number | string): Promise<void> {
  if (tokenId == null) return;
  try {
    await apiClient.get(`/record-view/${encodeURIComponent(String(tokenId))}`, { isAuthRequired: true });
  } catch (e) {
    console.warn('[NFTService] recordView error', e);
  }
}

// ---------------- Votes ----------------
export interface VoteOnNFTInput {
  streamTokenId: number | string;
  vote: boolean; // true = like, false = dislike
  account?: string;
}

export async function voteOnNFT(input: VoteOnNFTInput): Promise<{ error?: string } | undefined> {
  const { streamTokenId, vote } = input || {} as VoteOnNFTInput;
  if (streamTokenId == null) return undefined;
  const strUrl = `/request_vote?streamTokenId=${encodeURIComponent(String(streamTokenId))}&vote=${vote ? 'true' : 'false'}`;
  try {
    const res = await apiClient.get<{ error?: string }>(strUrl, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] voteOnNFT error', e);
    throw e;
  }
}

// ---------------- Comments ----------------
export interface PostCommentInput {
  streamTokenId: number | string;
  content: string;
  commentId?: number | string; // when provided, this is a reply
}

export interface PostCommentResponse { result?: any; [k: string]: any }

/**
 * Post a comment or reply on a stream (NFT).
 * - For a new comment: postComment({ streamTokenId, content })
 * - For a reply: postComment({ streamTokenId, content, commentId })
 */
export async function postComment(input: PostCommentInput): Promise<PostCommentResponse> {
  const { streamTokenId, content, commentId } = input || ({} as PostCommentInput);
  if (streamTokenId == null) throw new Error('streamTokenId required');
  if (!content || !String(content).trim()) throw new Error('content required');

  const url = `/request_comment?streamTokenId=${encodeURIComponent(String(streamTokenId))}`
    + `&content=${encodeURIComponent(String(content))}`
    + (commentId != null ? `&commentId=${encodeURIComponent(String(commentId))}` : '');
  try {
    const res = await apiClient.get<PostCommentResponse>(url, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] postComment error', e);
    throw e;
  }
}

// Fetch comments for a tokenId (paginated)
export interface GetCommentsParams {
  page?: number;
  unit?: number;
  skip?: number;
  limit?: number;
}

export interface GetCommentsResult {
  items: any[];
  totalCount: number;
  skip: number;
  limit: number;
  hasMore: boolean;
}

export interface GetCommentsResponse { result: GetCommentsResult; [k: string]: any }

export async function getCommentsForToken(
  tokenId: number | string,
  params?: GetCommentsParams
): Promise<GetCommentsResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  const base = `/nft/${encodeURIComponent(String(tokenId))}/comments`;
  const q = objectToGetParams(removeUndefined({
    page: params?.page,
    unit: params?.unit,
    skip: params?.skip,
    limit: params?.limit,
  }));
  const url = `${base}${q}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: false });
    if (res?.result) return res as GetCommentsResponse;
    // Fallback normalization
    if (Array.isArray(res)) {
      return { result: { items: res, totalCount: res.length, skip: 0, limit: res.length, hasMore: false } };
    }
    return { result: { items: [], totalCount: 0, skip: 0, limit: params?.limit ?? params?.unit ?? 20, hasMore: false } };
  } catch (e) {
    console.error('[NFTService] getCommentsForToken error', e);
    throw e;
  }
}

// ---------------- Mint (Upload) ----------------
export interface MintNftResponse {
  r: string;
  s: string;
  v: number;
  createdTokenId: number;
  timestamp: number;
  error: boolean;
  msg?: string;
  [k: string]: any;
}

/**
 * Remove irrelevant or unset fields from streamInfo before sending to backend
 */
// filteredStreamInfo moved to libs/validators.util.ts

/**
 * Upload & Mint endpoint. Expects multipart FormData with:
 * - name, description, postType, category (stringified array or comma-separated)
 * - files: video and thumbnail appended under the same key 'files'
 * - streamInfo: JSON string of filteredStreamInfo
 */
export async function minNft(data: FormData): Promise<MintNftResponse> {
  try {
    const res = await apiClient.post<MintNftResponse>(`/user_mint`, data, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] minNft error', e);
    throw e;
  }
}
