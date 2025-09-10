import { apiClient } from "../libs";

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

// Convenience paginated fetcher (simple wrapper)
export async function getNFTsPage(page: number, params?: Omit<SearchParams, 'page'>) {
  return getNFTs({ ...(params || {}), page });
}

// ---------------- Categories ----------------
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
