import { apiClient } from "../libs";
import type { SearchParams, GetNFTsResult, GetNFTsResponse } from "./nft.service";

// Local helpers (duplicated from nft.service with minimal scope)
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

/**
 * Feed-specific fetcher. Mirrors web getFeedNFTs behavior.
 * Uses the /feed endpoint.
 */
export async function getFeedNFTs(params?: SearchParams): Promise<GetNFTsResponse> {
  const hasSearch = !!(params?.search || params?.q);

  if (hasSearch) {
    const base = removeUndefined({
      search: params?.search || params?.q,
      limit: 50,
      sortBy: params?.sortMode || params?.sort,
      range: params?.range,
      category: params?.category,
      address: params?.address,
      postType: params?.postType || "feed-all",
      minter: params?.minter,
      owner: params?.owner,
      page: (params?.page ?? 0) + 1, // /feed uses 1-indexed pages
    });
    const query = objectToGetParams(base);
    const url = `/feed${query}`;
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    if (Array.isArray(res)) return { result: res } as GetNFTsResponse;
    if (res?.result && Array.isArray(res.result)) return res as GetNFTsResponse;
    if (Array.isArray(res?.data)) return { result: res.data } as GetNFTsResponse;
    return { result: [] } as GetNFTsResponse;
  }

  const base = removeUndefined({
    search: params?.search || params?.q,
    sortBy: params?.sortMode || params?.sort,
    limit: params?.unit ?? 20,
    range: params?.range,
    category: params?.category,
    address: params?.address,
    page: (params?.page ?? 0) + 1, // /feed uses 1-indexed pages
    postType: params?.postType || "feed-all",
    minter: params?.minter,
    owner: params?.owner,
  });
  const query = objectToGetParams(base);
  const url = `/feed${query}`;
  const res = await apiClient.get<any>(url, { isAuthRequired: true });
  if (Array.isArray(res)) return { result: res } as GetNFTsResponse;
  if (res?.result && Array.isArray(res.result)) return res as GetNFTsResponse;
  if (Array.isArray(res?.data)) return { result: res.data } as GetNFTsResponse;
  return { result: [] } as GetNFTsResponse;
}

export type { SearchParams, GetNFTsResult, GetNFTsResponse };

// Save post (feed) ----------------------------------------------------------
export async function savePost(tokenId: number | string, address?: string): Promise<{ result: any }> {
  if (tokenId == null) throw new Error('tokenId required');
  try {
    const body: any = { tokenId: Number(tokenId) };
    if (address) body.address = address;
    const res = await apiClient.post<{ result: any }>(`/savePost`, body, {
      isAuthRequired: true,
    });
    return res;
  } catch (error) {
    console.error('[FeedService] Error saving post:', error);
    throw new Error('Failed to save post');
  }
}

// Saved posts list (paginated) ---------------------------------------------
export async function getSavedPosts(params?: { page?: number; unit?: number; address?: string }): Promise<GetNFTsResponse> {
  const page = params?.page ?? 0;
  const unit = params?.unit ?? 20;
  const addr = params?.address;
  const query = objectToGetParams({ page, unit, address: addr });
  try {
    const res = await apiClient.get<any>(`/savedPosts${query}`, { isAuthRequired: true });
    if (Array.isArray(res)) return { result: res } as GetNFTsResponse;
    if (res?.result && Array.isArray(res.result)) return res as GetNFTsResponse;
    if (Array.isArray(res?.data)) return { result: res.data } as GetNFTsResponse;
    return { result: [] } as GetNFTsResponse;
  } catch (e) {
    console.error('[FeedService] getSavedPosts error', e);
    throw e;
  }
}
