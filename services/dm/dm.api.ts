import { apiClient } from "../../libs/api.client";
import { getFileName, guessMime } from "../../libs/assets.util";
import { DmAction, DmDisableStatus } from "../enums/dm-preferences.enum";
import type {
  DmConversation,
  DmMessage,
  DmMsgType,
  UploadDmMediaParams,
} from "./dm.types";


export async function getContactsByAddress(
  address: string,
): Promise<DmConversation[]> {
  const addr = (address || "").toLowerCase();
  return apiClient.get<DmConversation[]>(`/dm/contacts/${addr}`);
}

export async function getConversation(id: string): Promise<DmConversation> {
  return apiClient.get<DmConversation>(`/dm/${id}`);
}


export interface GetMessagesParams {
  address: string;
  q?: string;
  skip?: number;
  limit?: number;
}

export interface GetMessagesResponse {
  messages: DmMessage[];
}

export async function getMessages(
  conversationId: string,
  params: GetMessagesParams,
): Promise<GetMessagesResponse> {
  const qs = new URLSearchParams();
  if (params.address) qs.set("address", params.address.toLowerCase());
  if (params.q) qs.set("q", params.q);
  if (typeof params.skip === "number") qs.set("skip", String(params.skip));
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  return apiClient.get<GetMessagesResponse>(
    `/dm/messages/${conversationId}?${qs.toString()}`,
  );
}


export async function uploadDmMedia(
  params: UploadDmMediaParams,
): Promise<DmMessage> {
  const { conversationId, senderId, files, msgType, voiceDuration, content, txHash, tipTxHash, replyTo } =
    params;

  const form = new FormData();
  for (const f of files) {
    const name =
      f?.name && String(f.name).trim() ? f.name : getFileName(f.uri, "file");
    const type =
      f?.type && String(f.type).includes("/")
        ? f.type
        : guessMime(f.uri, "application/octet-stream");
    form.append("files", { uri: f.uri, name, type } as unknown as Blob);
  }
  form.append("conversationId", String(conversationId));
  form.append("senderId", String(senderId));
  if (msgType) form.append("msgType", msgType);
  if (voiceDuration != null)
    form.append("voiceDuration", String(voiceDuration));
  if (content) form.append("content", content);
  if (txHash) form.append("txHash", txHash);
  if (tipTxHash) form.append("tipTxHash", tipTxHash);
  if (replyTo) form.append("replyTo", String(replyTo));

  return apiClient.post<DmMessage>("/dm/upload", form, {
    isAuthRequired: true,
  });
}


export interface VerifyDmFeeResult {
  verified: boolean;
  txHash?: string;
  error?: string;
}

export async function verifyDmFee(
  senderAddress: string,
  receiverAddress: string,
  txHash: string,
): Promise<VerifyDmFeeResult> {
  return apiClient.post<VerifyDmFeeResult>(
    "/dm/verify-dm-fee",
    { senderAddress, receiverAddress, txHash },
    { isAuthRequired: true },
  );
}

export interface TipNotifyResult {
  success: boolean;
  tipId?: string;
}

export async function tipNotify(params: {
  txHash: string;
  conversationId: string;
  senderAddress: string;
  chainId?: number;
  tokenAddress?: string;
  amount?: string;
}): Promise<TipNotifyResult> {
  return apiClient.post<TipNotifyResult>("/dm/tip-notify", params, {
    isAuthRequired: true,
  });
}


export async function addFreeAccess(address: string): Promise<void> {
  await apiClient.post("/dm/free-access", { address }, { isAuthRequired: true });
}

export async function removeFreeAccess(address: string): Promise<void> {
  await apiClient.delete("/dm/free-access", {
    data: { address },
    isAuthRequired: true,
  } as any);
}

export async function getFreeAccessList(
  creatorAddress: string,
): Promise<string[]> {
  return apiClient.get<string[]>(`/dm/free-access/${creatorAddress}`, {
    isAuthRequired: true,
  });
}


export interface DmUserStatus {
  address: string;
  disables?: DmDisableStatus[];
  perMessageFee?: number;
  freeAccessUsers?: string[];
}

export async function getDmUserStatus(
  address: string,
): Promise<DmUserStatus> {
  const addr = (address || "").toLowerCase();
  return apiClient.get<DmUserStatus>(`/dm/user-status/${addr}`, {
    isAuthRequired: true,
  });
}

export async function updateDmUserStatus(
  address: string,
  status: DmDisableStatus,
  action: DmAction,
  perMessageFee?: number,
): Promise<{ message?: string; data?: DmUserStatus }> {
  const addr = (address || "").toLowerCase();
  const payload: Record<string, unknown> = { status, action };
  if (perMessageFee !== undefined) payload.perMessageFee = perMessageFee;
  return apiClient.post(`/dm/user-status/${addr}`, payload, {
    isAuthRequired: true,
  });
}


export async function searchDmUsers(query: string): Promise<DmConversation[]> {
  return apiClient.get<DmConversation[]>(
    `/dm/search?searchQuery=${encodeURIComponent(query)}`,
    { isAuthRequired: true },
  );
}


/** Permanently delete a conversation (hard-delete own msgs, remove from contacts). */
export async function deleteConversation(
  dmId: string,
  address: string,
): Promise<{ success: boolean; message?: string; deletedMessages?: number }> {
  return apiClient.delete(`/dm/conversation/${dmId}`, {
    data: { address },
    isAuthRequired: true,
  } as any);
}

export async function bulkDeleteMessages(
  dmId: string,
  messageIds: string[],
  address: string,
): Promise<void> {
  await apiClient.post(
    "/dm/delete-messages",
    { dmId, messageIds, address },
    { isAuthRequired: true },
  );
}

export async function pinDmMessage(
  dmId: string,
  messageId: string,
  address: string,
): Promise<void> {
  await apiClient.post(
    `/dm/${dmId}/pin`,
    { messageId, address },
    { isAuthRequired: true },
  );
}

export async function unpinDmMessage(
  dmId: string,
  messageId: string,
  address: string,
): Promise<void> {
  await apiClient.delete(`/dm/${dmId}/pin`, {
    data: { messageId, address },
    isAuthRequired: true,
  } as any);
}
