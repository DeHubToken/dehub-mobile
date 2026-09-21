import { apiClient } from "../libs";
import type { GetNFTsResponse } from "./nft.service";

export interface BookmarkFolder {
  _id: string | number;
  name: string;
  description?: string;
  /** Shown on the owner's profile as a playlist. */
  isPublic?: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetFoldersResponse {
  status: boolean;
  result: BookmarkFolder[];
}

/** One of a profile's public playlists, as the profile tab lists them. */
export interface PublicPlaylist {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  updatedAt: string;
  coverTokenId: number | null;
  coverImageUrl: string | null;
}

export interface PublicPlaylistPage {
  status: boolean;
  playlist: { id: string; name: string; description: string; updatedAt: string };
  /** Feed-shaped posts, same enrichment as pins, flattened like getFolderItems. */
  result: any[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function createFolder(
  name: string,
  description?: string,
  isPublic?: boolean,
): Promise<{ status: boolean; result: BookmarkFolder }> {
  if (!name?.trim()) throw new Error("Folder name is required");
  return apiClient.post("/bookmark-folders", { name: name.trim(), description, isPublic: isPublic === true });
}

export async function getFolders(): Promise<GetFoldersResponse> {
  const res = await apiClient.get<any>("/bookmark-folders", { isAuthRequired: true });
  // Handle wraps / raw arrays
  if (res?.status !== undefined) return res;
  if (Array.isArray(res)) return { status: true, result: res };
  if (res?.result && Array.isArray(res.result)) return { status: true, result: res.result };
  return { status: true, result: [] };
}

export async function updateFolder(
  folderId: string | number,
  data: { name?: string; description?: string; isPublic?: boolean }
): Promise<{ status: boolean; result: BookmarkFolder }> {
  if (folderId == null) throw new Error("Folder ID is required");
  return apiClient.put(`/bookmark-folders/${folderId}`, data);
}

export async function deleteFolder(folderId: string | number): Promise<{ status: boolean }> {
  if (folderId == null) throw new Error("Folder ID is required");
  return apiClient.delete(`/bookmark-folders/${folderId}`);
}

export async function addItemToFolder(
  folderId: string | number,
  tokenId: number
): Promise<{ status: boolean; result?: any }> {
  if (folderId == null) throw new Error("Folder ID is required");
  if (tokenId == null) throw new Error("Token ID is required");
  return apiClient.post(`/bookmark-folders/${folderId}/items`, { tokenId });
}

export async function removeItemFromFolder(
  folderId: string | number,
  tokenId: number
): Promise<{ status: boolean }> {
  if (folderId == null) throw new Error("Folder ID is required");
  if (tokenId == null) throw new Error("Token ID is required");
  return apiClient.delete(`/bookmark-folders/${folderId}/items/${tokenId}`);
}

export async function getFolderItems(
  folderId: string | number,
  params?: { page?: number; limit?: number }
): Promise<GetNFTsResponse> {
  if (folderId == null) throw new Error("Folder ID is required");
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const query = `?page=${page}&limit=${limit}`;
  const res = await apiClient.get<any>(`/bookmark-folders/${folderId}/items${query}`, { isAuthRequired: true });

  // Normalise: API returns same structure as feed
  const wrapper = (res?.data?.result ?? res?.result ?? res) as any;
  const items = Array.isArray(wrapper) ? wrapper : Array.isArray(wrapper?.items) ? wrapper.items : [];
  const pagination = res?.data?.pagination ?? res?.pagination ?? res?.result?.pagination;

  // Flatten items by merging nested 'post' object fields
  const flatItems = items.map((item: any) => {
    if (item.post) {
      return {
        ...item,
        ...item.post,
        id: item.tokenId, // Ensure compatible ID field
      };
    }
    return item;
  });

  return {
    result: flatItems,
    totalCount: pagination?.totalCount,
    page: pagination?.page,
    hasMore: pagination?.hasMore ?? (flatItems.length === limit),
  } as GetNFTsResponse;
}

// ─── Public playlists ───────────────────────────────────────────────────
// The read side of a folder its owner made public. No auth: the server only
// ever answers with public folders, so a private one is a 404 here even to
// the person who owns it.

export async function getPublicPlaylists(address: string): Promise<PublicPlaylist[]> {
  if (!address) return [];
  const res = await apiClient.get<{ status: boolean; result: PublicPlaylist[] }>(
    `/users/${encodeURIComponent(address)}/playlists`,
    { isAuthRequired: false },
  );
  return Array.isArray(res?.result) ? res.result : [];
}

export async function getPublicPlaylistItems(
  address: string,
  playlistId: string,
  params?: { limit?: number; cursor?: string | null },
): Promise<PublicPlaylistPage> {
  if (!address || !playlistId) throw new Error("Playlist is required");
  const query: Record<string, any> = { limit: params?.limit ?? 20 };
  if (params?.cursor) query.cursor = params.cursor;
  const res = await apiClient.get<any>(
    `/users/${encodeURIComponent(address)}/playlists/${encodeURIComponent(playlistId)}`,
    { isAuthRequired: false, params: query },
  );
  const items: any[] = Array.isArray(res?.result) ? res.result : [];
  // Same flattening as getFolderItems so FeedCard gets a post at the root.
  const flatItems = items.map((item: any) =>
    item.post ? { ...item, ...item.post, id: item.tokenId ?? item.post.tokenId } : item,
  );
  return {
    status: !!res?.status,
    playlist: res?.playlist,
    result: flatItems,
    hasMore: !!res?.hasMore,
    nextCursor: res?.nextCursor ?? null,
  };
}
