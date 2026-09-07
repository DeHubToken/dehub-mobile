import { apiClient } from "../libs/api.client";
import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";

/* ─── Types ─────────────────────────────────────────────────── */

export interface LiveChatUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isModerator?: boolean;
  isBanned?: boolean;
  followers?: number;
  followings?: number;
  badgeBalance?: number;
  accountCreatedAt?: string;
}

export interface LiveChatMessageReaction {
  [emoji: string]: string[]; // emoji → array of addresses
}

export interface LiveChatReplyTo {
  _id: string;
  id?: string;
  content?: string;
  senderAddress: string;
  senderUsername?: string;
  sender?: LiveChatUser;
}

export interface LiveChatMessageData {
  _id: string;
  roomId: string;
  sender?: LiveChatUser;
  senderAddress: string;
  content: string;
  messageType: "text" | "media" | "gif" | "system" | "audio" | "voice";
  systemType?: "announcement" | "milestone";
  audioUrl?: string;
  audioDuration?: number;
  media?: {
    url: string;
    type: "image" | "gif";
    mimeType?: string;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
  }[];
  gif?: {
    provider: "giphy" | "tenor";
    gifId: string;
    url: string;
    previewUrl: string;
    width: number;
    height: number;
  };
  replyTo?: LiveChatReplyTo;
  replyToContent?: string;
  replyToSenderAddress?: string;
  mentions?: { address: string; username?: string }[];
  reactions?: LiveChatMessageReaction;
  isPinned?: boolean;
  pinnedBy?: string;
  pinnedAt?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LiveChatRoom {
  roomId: string;
  name: string;
  description?: string;
  isActive: boolean;
  messageCount: number;
  lastMessageAt?: string;
  slowMode: boolean;
  slowModeSeconds: number;
  minStakeRequired: number;
  moderators: string[];
  bannedUsers: string[];
  onlineCount?: number;
  pinnedMessages?: LiveChatMessageData[];
}

export interface LiveChatStatusResponse {
  isBanned: boolean;
  isModerator: boolean;
  canChat: boolean;
}

export interface LiveChatMessagesResponse {
  messages: LiveChatMessageData[];
  hasMore: boolean;
}

export interface LiveChatRoomJoinedPayload {
  room: LiveChatRoom;
  messages: LiveChatMessageData[];
  yourUser: LiveChatUser;
  isBanned: boolean;
  canSendMessages: boolean;
  onlineCount?: number;
}

export interface SendMessagePayload {
  content?: string;
  messageType?: "text" | "media" | "gif" | "audio" | "voice";
  audioUrl?: string;
  audioDuration?: number;
  media?: {
    url: string;
    type: "image" | "gif";
    mimeType?: string;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
  }[];
  gif?: {
    provider: "giphy" | "tenor";
    gifId: string;
    url: string;
    previewUrl: string;
    width: number;
    height: number;
  };
  replyTo?: string;
  mentions?: { address: string; username?: string }[];
}

/* ─── REST API ──────────────────────────────────────────────── */

export async function getLiveChatRoom(): Promise<LiveChatRoom> {
  return apiClient.get<LiveChatRoom>("/livechat/room");
}

export async function getLiveChatMessages(params?: {
  before?: string;
  after?: string;
  limit?: number;
}): Promise<LiveChatMessagesResponse> {
  const qs = new URLSearchParams();
  if (params?.before) qs.set("before", params.before);
  if (params?.after) qs.set("after", params.after);
  if (params?.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return apiClient.get<LiveChatMessagesResponse>(
    `/livechat/messages${query ? `?${query}` : ""}`
  );
}

export async function getLiveChatStatus(): Promise<LiveChatStatusResponse> {
  return apiClient.get<LiveChatStatusResponse>("/livechat/status");
}

export async function getLiveChatOnlineCount(): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>("/livechat/online");
}

/* ─── Mod Actions ───────────────────────────────────────────── */

export async function getLiveChatUserProfile(address: string): Promise<LiveChatUser> {
  return apiClient.get<LiveChatUser>(`/livechat/user/${address}`);
}

export async function banUser(address: string): Promise<void> {
  return apiClient.post("/livechat/mod/ban", { address });
}

export async function unbanUser(address: string): Promise<void> {
  return apiClient.delete(`/livechat/mod/ban/${address}`);
}

export async function pinMessage(messageId: string): Promise<void> {
  return apiClient.post(`/livechat/mod/pin/${messageId}`, {});
}

export async function unpinMessage(messageId: string): Promise<void> {
  return apiClient.delete(`/livechat/mod/pin/${messageId}`);
}

export async function deleteMessage(messageId: string): Promise<void> {
  return apiClient.delete(`/livechat/mod/message/${messageId}`);
}

export async function uploadLiveChatVoice(
  fileUri: string,
  mimeType: string,
  fileName: string
): Promise<{ url: string; duration: number }> {
  const formData = new FormData();
  formData.append("audio", {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as any);

  return apiClient.post<{ url: string; duration: number }>(
    "/livechat/upload-voice",
    formData
  );
}

/**
 * Upload an image for public chat.
 *
 * Goes to the same Supabase edge function web uses (`dm-upload-media`, see
 * dehubweb src/lib/api/dehub/dm.ts) rather than the DeHub API: livechat has no
 * upload route of its own for pictures, only for voice, and the bucket the
 * function writes to is what both clients already render from.
 *
 * A plain fetch rather than supabase.functions.invoke because the body is
 * multipart with a React Native file descriptor, and invoke() would set its own
 * content type over the boundary fetch generates.
 *
 * The function accepts jpeg, png, gif and webp up to 10 MB and nothing else —
 * video is rejected there as well as by the chat message type, so a picker that
 * offers it would be offering something no client can post.
 */
export async function uploadLiveChatImage(
  fileUri: string,
  mimeType: string,
  fileName: string,
  walletAddress: string,
): Promise<{ url: string }> {
  const token = await getAuthToken();
  if (!token) throw new Error("Not signed in");

  const form = new FormData();
  form.append("file", { uri: fileUri, name: fileName, type: mimeType } as any);

  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/dm-upload-media`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      "x-wallet-address": walletAddress.toLowerCase(),
      "x-dehub-token": token,
    },
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !data?.url) {
    throw new Error(data?.error || "Upload failed");
  }
  return { url: data.url as string };
}
