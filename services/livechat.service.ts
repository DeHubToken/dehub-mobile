import { apiClient } from "../libs/api.client";
import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";
import { translateCopy as _translateCopy } from '../i18n/copy';

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
  /** Set for a reply to a photo, GIF or voice note, which have no text to quote. */
  messageType?: string;
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
  /**
   * The room to page through. Left off, the backend answers with the global
   * platform room, so a stream's chat pulled public messages in under its own
   * as soon as anyone scrolled up.
   */
  roomId?: string;
}): Promise<LiveChatMessagesResponse> {
  const qs = new URLSearchParams();
  if (params?.before) qs.set("before", params.before);
  if (params?.after) qs.set("after", params.after);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.roomId) qs.set("roomId", params.roomId);
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
  if (!token) throw new Error(_translateCopy("copy.491fc91cd76e", { defaultValue: "Not signed in" }));

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
    throw new Error(data?.error || _translateCopy("copy.6efc5d27f30b", { defaultValue: "Upload failed" }));
  }
  return { url: data.url as string };
}

// ─── A creator's moderation of their own stream chats ─────────────────────────
// The twin of dehubweb src/lib/api/dehub/livechat.ts. Never the platform chat.

/** Time someone out of this creator's stream chats. The creator, their moderators and staff only. */
export async function timeOutInStream(tokenId: string | number, address: string, seconds: number): Promise<void> {
  await apiClient.post(`/livechat/stream/${encodeURIComponent(String(tokenId))}/timeout`, { address: address.toLowerCase(), seconds }, { isAuthRequired: true });
}

/** Ban someone from every stream chat of this creator. */
export async function banFromStreams(tokenId: string | number, address: string): Promise<void> {
  await apiClient.post(`/livechat/stream/${encodeURIComponent(String(tokenId))}/ban`, { address: address.toLowerCase() }, { isAuthRequired: true });
}

export interface StreamModerationSettings {
  slowModeSeconds: number;
  followersOnly: boolean;
  subscribersOnly: boolean;
  bannedWords: string[];
  wordAction: "block" | "timeout";
}

export interface StreamModerationPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface StreamModerationLogEntry {
  actor: string;
  target: string;
  action: "timeout" | "ban" | "unban" | "moderator-added" | "moderator-removed" | "word-blocked" | "word-timeout";
  seconds?: number;
  word?: string;
  at: string;
}

export interface MyStreamModeration {
  settings: StreamModerationSettings;
  moderators: StreamModerationPerson[];
  banned: StreamModerationPerson[];
  log: StreamModerationLogEntry[];
}

function myModeration(res: any): MyStreamModeration {
  const body = res?.result ?? res?.data ?? res;
  return {
    settings: {
      slowModeSeconds: Number(body?.settings?.slowModeSeconds) || 0,
      followersOnly: !!body?.settings?.followersOnly,
      subscribersOnly: !!body?.settings?.subscribersOnly,
      bannedWords: Array.isArray(body?.settings?.bannedWords) ? body.settings.bannedWords : [],
      wordAction: body?.settings?.wordAction === "timeout" ? "timeout" : "block",
    },
    moderators: Array.isArray(body?.moderators) ? body.moderators : [],
    banned: Array.isArray(body?.banned) ? body.banned : [],
    log: Array.isArray(body?.log) ? body.log : [],
  };
}

export async function getMyStreamModeration(): Promise<MyStreamModeration> {
  return myModeration(await apiClient.get<any>("/livechat/moderation/mine", { isAuthRequired: true }));
}

export async function saveMyStreamModeration(settings: StreamModerationSettings): Promise<MyStreamModeration> {
  return myModeration(await apiClient.put<any>("/livechat/moderation/mine", settings, { isAuthRequired: true }));
}

export async function addStreamModerator(address: string): Promise<MyStreamModeration> {
  return myModeration(await apiClient.post<any>("/livechat/moderation/mine/moderators", { address: address.toLowerCase() }, { isAuthRequired: true }));
}

export async function removeStreamModerator(address: string): Promise<MyStreamModeration> {
  return myModeration(await apiClient.delete<any>(`/livechat/moderation/mine/moderators/${address.toLowerCase()}`, { isAuthRequired: true }));
}

export async function unbanFromStreams(address: string): Promise<MyStreamModeration> {
  return myModeration(await apiClient.delete<any>(`/livechat/moderation/mine/bans/${address.toLowerCase()}`, { isAuthRequired: true }));
}
