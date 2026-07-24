import { apiClient } from "../libs";
import type { GetNFTsResponse } from "./nft.service";

export interface BookmarkFolder {
  _id: string | number;
  name: string;
  description?: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetFoldersResponse {
  status: boolean;
  result: BookmarkFolder[];
}

export async function createFolder(name: string, description?: string): Promise<{ status: boolean; result: BookmarkFolder }> {
  if (!name?.trim()) throw new Error("Folder name is required");
  return apiClient.post("/bookmark-folders", { name: name.trim(), description });
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
  data: { name?: string; description?: string }
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
