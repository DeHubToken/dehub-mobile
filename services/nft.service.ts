import { apiClient } from "../libs";
import { streamInfoKeys } from "../config/constants";

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
  isOwner?: boolean;
  isUnlocked?: boolean;
  [key: string]: any; // allow forward compatibility
}

export interface GetNFTsResponse { result: GetNFTsResult[]; [k: string]: any }

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

export async function getNFTs(params?: SearchParams): Promise<GetNFTsResponse> {
  const baseParams: Record<string, any> = {
    search: params?.search || params?.q,
    sortBy: params?.sortMode || params?.sort,
    limit: params?.unit ?? 40,
    range: params?.range,
    category: params?.category,
    address: params?.address,
    page: (params?.page ?? 0) + 1, // /feed uses 1-indexed pages
    postType: params?.postType,
    minter: params?.minter,
    owner: params?.owner,
  };

  const query = objectToGetParams(removeUndefined(baseParams));
  const url = `/feed${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
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

export interface SuggestedVideosParams {
  page?: number;
  limit?: number;
}

export interface SuggestedVideosResponse {
  status: boolean;
  result: GetNFTsResult[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function getSuggestedVideos(
  tokenId: number | string,
  params?: SuggestedVideosParams,
): Promise<SuggestedVideosResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  const query = objectToGetParams(
    removeUndefined({
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
    }),
  );
  const url = `/suggested/${tokenId}${query}`;
  try {
    const res = await apiClient.get<SuggestedVideosResponse>(url, { isAuthRequired: true });
    if (res?.result && Array.isArray(res.result)) return res;
    if (Array.isArray(res)) return { status: true, result: res, pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 1, hasMore: false } };
    return { status: true, result: [], pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 1, hasMore: false } };
  } catch (e) {
    console.error('[NFTService] getSuggestedVideos error', e);
    throw e;
  }
}

export interface SingleNFTResponse { result: GetNFTsResult; [k: string]: any }

export async function getNFT(
  tokenId: number | string, 
  options?: { commentId?: number | string }
): Promise<SingleNFTResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  let url = `/nft_info/${tokenId}`;
  if (options?.commentId != null) {
    url += `?commentId=${encodeURIComponent(String(options.commentId))}`;
  }
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
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

export interface VoteOnNFTInput {
  streamTokenId: number | string;
  vote: boolean; // true = like, false = dislike
  account?: string;
}

export async function voteOnNFT(input: VoteOnNFTInput): Promise<{ error?: string } | undefined> {
  const { streamTokenId, vote } = input || {} as VoteOnNFTInput;
  if (streamTokenId == null) return undefined;
  try {
    const res = await apiClient.post<{ error?: string }>(
      '/request_vote',
      { streamTokenId: Number(streamTokenId), vote },
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] voteOnNFT error', e);
    throw e;
  }
}

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

  try {
    const body: Record<string, any> = {
      streamTokenId: Number(streamTokenId),
      content: String(content),
    };
    if (commentId != null) body.commentId = Number(commentId);
    const res = await apiClient.post<PostCommentResponse>(
      '/request_comment',
      body,
      { isAuthRequired: true }
    );
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
  address?: string; // viewer address for isLiked field
  commentId?: number | string; // highlight specific comment (for sharing)
}

export interface CommentUser {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers?: number;
  followings?: number;
  sentTips?: number;
  receivedTips?: number;
  createdAt?: string;
}

export interface Comment {
  id: number;
  address?: string;
  content: string;
  imageUrl?: string;
  gifUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  createdAt: string;
  parentId?: number;
  replyIds?: number[];
  likeCount: number;
  isLiked?: boolean;
  notFound?: boolean;
  user?: CommentUser;
}

export interface GetCommentsResult {
  items: Comment[];
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
    address: params?.address,
    commentId: params?.commentId,
  }));
  const url = `${base}${q}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
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

// Like/unlike a comment (toggleable)
export interface LikeCommentInput {
  commentId: number | string;
}

export interface LikeCommentResult {
  result: boolean;
  liked: boolean;
  likes: number;
}

export async function likeComment(input: LikeCommentInput): Promise<LikeCommentResult> {
  const { commentId } = input;
  if (commentId == null) throw new Error('commentId required');
  try {
    const res = await apiClient.post<LikeCommentResult>(
      '/like_comment',
      { commentId: Number(commentId) },
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] likeComment error', e);
    throw e;
  }
}

// Edit a comment
export interface EditCommentInput {
  commentId: number | string;
  content: string;
}

export interface EditCommentResult {
  result: boolean;
  commentId: number;
  content: string;
  edited: boolean;
}

export async function editComment(input: EditCommentInput): Promise<EditCommentResult> {
  const { commentId, content } = input;
  if (commentId == null) throw new Error('commentId required');
  if (!content?.trim()) throw new Error('content required');
  try {
    const url = `/edit_comment?commentId=${encodeURIComponent(String(commentId))}&content=${encodeURIComponent(content)}`;
    const res = await apiClient.post<EditCommentResult>(url, {}, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] editComment error', e);
    throw e;
  }
}

// Delete a comment
export interface DeleteCommentInput {
  commentId: number | string;
}

export interface DeleteCommentResult {
  result: boolean;
  commentId: number;
  deletedCount: number;
}

export async function deleteComment(input: DeleteCommentInput): Promise<DeleteCommentResult> {
  const { commentId } = input;
  if (commentId == null) throw new Error('commentId required');
  try {
    const res = await apiClient.delete<DeleteCommentResult>(
      `/delete_comment?commentId=${encodeURIComponent(String(Number(commentId)))}`,
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] deleteComment error', e);
    throw e;
  }
}

// Post a comment with an image attachment (multipart/form-data)
export interface PostImageCommentInput {
  streamTokenId: number | string;
  fileUri: string;
  fileName?: string;
  mimeType?: string;
  content?: string;
  commentId?: number | string;
}

export interface PostImageCommentResponse {
  result: boolean;
  commentId: number;
}

export async function postImageComment(input: PostImageCommentInput): Promise<PostImageCommentResponse> {
  const { streamTokenId, fileUri, fileName, mimeType, content, commentId } = input;
  if (streamTokenId == null) throw new Error('streamTokenId required');
  if (!fileUri) throw new Error('fileUri required');

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: fileName || `comment_image_${Date.now()}.jpg`,
    type: mimeType || 'image/jpeg',
  } as any);

  const qs = new URLSearchParams();
  qs.set('streamTokenId', String(streamTokenId));
  if (content?.trim()) qs.set('content', content.trim());
  if (commentId != null) qs.set('commentId', String(commentId));

  try {
    const res = await apiClient.post<PostImageCommentResponse>(
      `/comment_image?${qs.toString()}`,
      formData,
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] postImageComment error', e);
    throw e;
  }
}

// Post a comment with a GIF URL (Giphy / Tenor)
export interface PostGifCommentInput {
  streamTokenId: number | string;
  gifUrl: string;
  content?: string;
  commentId?: number | string;
}

export interface PostGifCommentResponse {
  result: boolean;
  commentId: number;
}

export async function postGifComment(input: PostGifCommentInput): Promise<PostGifCommentResponse> {
  const { streamTokenId, gifUrl, content, commentId } = input;
  if (streamTokenId == null) throw new Error('streamTokenId required');
  if (!gifUrl) throw new Error('gifUrl required');

  try {
    const res = await apiClient.post<PostGifCommentResponse>(
      '/comment_gif',
      {
        streamTokenId: Number(streamTokenId),
        gifUrl,
        ...(content?.trim() ? { content: content.trim() } : {}),
        ...(commentId != null ? { commentId: Number(commentId) } : {}),
      },
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] postGifComment error', e);
    throw e;
  }
}

// Post a voice note comment (multipart/form-data, max 30s)
export interface PostAudioCommentInput {
  streamTokenId: number | string;
  fileUri: string;
  fileName?: string;
  mimeType?: string;
  content?: string;
  commentId?: number | string;
}

export interface PostAudioCommentResponse {
  result: boolean;
  commentId: number;
  audioUrl: string;
  audioDuration: number;
}

export async function postAudioComment(input: PostAudioCommentInput): Promise<PostAudioCommentResponse> {
  const { streamTokenId, fileUri, fileName, mimeType, content, commentId } = input;
  if (streamTokenId == null) throw new Error('streamTokenId required');
  if (!fileUri) throw new Error('fileUri required');

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: fileName || `voice_note_${Date.now()}.m4a`,
    type: mimeType || 'audio/m4a',
  } as any);

  const qs = new URLSearchParams();
  qs.set('streamTokenId', String(streamTokenId));
  if (content?.trim()) qs.set('content', content.trim());
  if (commentId != null) qs.set('commentId', String(commentId));

  try {
    const res = await apiClient.post<PostAudioCommentResponse>(
      `/comment_audio?${qs.toString()}`,
      formData,
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] postAudioComment error', e);
    throw e;
  }
}

export interface BountySignature {
  v: number;
  r: string;
  s: string;
}

export interface ClaimBountyResponse {
  error?: boolean | string;
  result: {
    viewer?: BountySignature;
    commentor?: BountySignature;
    viewer_claimed?: boolean;
    commentor_claimed?: boolean;
  };
  claimed?: {
    viewer?: boolean;
    commentor?: boolean;
  };
}

/**
 * Check eligibility and get signature for bounty claim
 * Returns signatures for eligible bounty types (viewer/commentor)
 */
export async function getClaimBountySignature(tokenId: number | string): Promise<ClaimBountyResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  try {
    const url = `/claim-bounty?tokenId=${encodeURIComponent(String(tokenId))}`;
    const res = await apiClient.get<ClaimBountyResponse>(url, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] getClaimBountySignature error', e);
    throw e;
  }
}

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

export interface EditPostInput {
  name?: string;
  description?: string;
  category?: string[];
}

export interface EditPostResponse {
  result: boolean;
  data?: { tokenId: number; name?: string; description?: string; category?: string[] };
}

/**
 * Edit the title, description, and/or categories of your own post.
 * PATCH /api/nft/{tokenId}
 */
export async function editPost(tokenId: number | string, input: EditPostInput): Promise<EditPostResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  try {
    const res = await apiClient.patch<EditPostResponse>(`/nft/${encodeURIComponent(String(tokenId))}`, input, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] editPost error', e);
    throw e;
  }
}

export interface ToggleVisibilityResponse {
  result: boolean;
  data?: Record<string, any>;
}

/**
 * Toggle visibility of a video (show/hide from public feeds).
 * POST /api/token_visibility
 */
export async function togglePostVisibility(tokenId: number | string, isHidden: boolean): Promise<ToggleVisibilityResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  try {
    const res = await apiClient.post<ToggleVisibilityResponse>('/token_visibility', { id: Number(tokenId), isHidden }, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] togglePostVisibility error', e);
    throw e;
  }
}

export interface DeletePostResponse {
  result: boolean;
  message?: string;
}

/**
 * Soft deletes a video/post by setting isDeleted to true.
 * DELETE /api/nft/{tokenId}
 */
export async function deletePost(tokenId: number | string): Promise<DeletePostResponse> {
  if (tokenId == null) throw new Error('tokenId required');
  try {
    const res = await apiClient.delete<DeletePostResponse>(`/nft/${encodeURIComponent(String(tokenId))}`, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] deletePost error', e);
    throw e;
  }
}

export interface ReportContentInput {
  tokenId: number | string;
  reason: string;
  additionalInfo?: string;
}

export interface ReportResponse {
  result: boolean;
  message?: string;
}

/**
 * Report content for review.
 * POST /api/report/content
 */
export async function reportContent(input: ReportContentInput): Promise<ReportResponse> {
  if (input.tokenId == null) throw new Error('tokenId required');
  try {
    const res = await apiClient.post<ReportResponse>('/report/content', {
      tokenId: Number(input.tokenId),
      reason: input.reason,
      additionalInfo: input.additionalInfo || '',
    }, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] reportContent error', e);
    throw e;
  }
}

export interface ReportUserInput {
  userId: string;
  reason: string;
  additionalInfo?: string;
}

/**
 * Report a user for review.
 * POST /api/report/user
 */
export async function reportUser(input: ReportUserInput): Promise<ReportResponse> {
  if (!input.userId) throw new Error('userId required');
  try {
    const res = await apiClient.post<ReportResponse>('/report/user', {
      userId: input.userId,
      reason: input.reason,
      additionalInfo: input.additionalInfo || '',
    }, { isAuthRequired: true });
    return res;
  } catch (e) {
    console.error('[NFTService] reportUser error', e);
    throw e;
  }
}

export interface ReportStatusResponse {
  hasReported: boolean;
  reportId?: string;
}

/**
 * Check if the current user has already reported this content.
 * GET /api/report/content/status/:tokenId
 */
export async function getContentReportStatus(tokenId: number | string): Promise<ReportStatusResponse> {
  try {
    const res = await apiClient.get<ReportStatusResponse>(
      `/report/content/status/${tokenId}`,
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] getContentReportStatus error', e);
    throw e;
  }
}

/**
 * Check if the current user has already reported this user.
 * GET /api/report/user/status/:userId
 */
export async function getUserReportStatus(userId: string): Promise<ReportStatusResponse> {
  try {
    const res = await apiClient.get<ReportStatusResponse>(
      `/report/user/status/${userId}`,
      { isAuthRequired: true }
    );
    return res;
  } catch (e) {
    console.error('[NFTService] getUserReportStatus error', e);
    throw e;
  }
}
