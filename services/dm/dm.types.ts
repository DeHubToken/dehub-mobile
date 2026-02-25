/**
 * DM type definitions — single source of truth
 *
 * Matches the backend models described in docs/dm-system.md.
 * Every component / service / store should import from here.
 */

// ─── Primitives ─────────────────────────────────────────────────────────────

export type ID = string;

// ─── User ───────────────────────────────────────────────────────────────────

/** Populated user reference returned by the backend inside messages & participants. */
export interface DmUser {
  _id: ID;
  username?: string;
  address?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

// ─── Conversation (DM) ─────────────────────────────────────────────────────

export interface DmParticipant {
  participant: DmUser;
  role?: string;
}

export interface DmTip {
  _id: ID;
  totalTip: number;
  userDetails?: DmUser;
}

/** A single conversation from `GET /dm/contacts/:address`. */
export interface DmConversation {
  _id: ID;
  conversationType: "dm";
  participants: DmParticipant[];
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  blockList?: { userId: ID; blockedAt: string }[];
  tips?: DmTip[];
  messages?: DmMessage[]; // last N messages from pipeline
  unreadCount?: number;
  deletedForUsers?: { userId: ID; deletedAt: string }[];
}

// ─── Reply Preview ──────────────────────────────────────────────────────────

/** Populated reply-to preview returned by the backend (via $lookup). */
export interface ReplyPreview {
  _id: ID;
  content: string; // truncated to 200 chars server-side
  msgType: DmMsgType;
  mediaUrls: DmMediaUrl[]; // first item only
  voiceDuration: number | null;
  sender: {
    _id: ID;
    username: string;
    address: string;
    displayName: string;
    avatarImageUrl: string;
  };
}

// ─── Message ────────────────────────────────────────────────────────────────

export type DmMsgType = "msg" | "media" | "gif" | "voice" | "tip";

export interface DmMediaUrl {
  url: string;
  type?: string;
  mimeType?: string;
  _id?: ID;
}

export interface DmForwardedFrom {
  conversationId: ID;
  messageId: ID;
}

/** A single DM message. */
export interface DmMessage {
  _id: ID;
  conversation: ID;
  sender: DmUser | ID; // aggregate may populate
  author?: "me" | "other";
  content?: string;
  msgType?: DmMsgType;
  mediaUrls?: DmMediaUrl[];
  uploadStatus?: "pending" | "complete" | "failed";
  failureReason?: string;
  isRead?: boolean;
  isDownloaded?: boolean;

  // Voice
  voiceDuration?: number; // seconds, max 60

  // Edit tracking
  isEdited?: boolean;
  editedAt?: string;

  // Forward tracking
  isForwarded?: boolean;
  forwardedFrom?: DmForwardedFrom | null;

  // Reply tracking
  replyTo?: ReplyPreview | null;

  // Timestamps
  createdAt: string;
  updatedAt?: string;

  // Payment
  isPaid?: boolean;
  txHash?: string;
  paymentStatus?: "pending" | "confirmed" | null;
  paymentTxHash?: string | null;

  // Tip message metadata (only populated when msgType === 'tip')
  tipAmount?: number | null;
  tipSymbol?: string | null;
}

// ─── DM Fee ─────────────────────────────────────────────────────────────────

/** Returned inside `createAndStart` response data. */
export interface DmFee {
  required: boolean;
  fee: number;
  hasFreeAccess: boolean;
}

/** Server → Client: feeConfirmed event (per-message fee / tip confirmed on-chain). */
export interface FeeConfirmedPayload {
  messageId: ID;
  conversationId: ID;
  txHash: string;
  amount: number;
  status: "confirmed";
}

// ─── Peer Policy (access control cache) ─────────────────────────────────────

export interface DmPeerPolicy {
  address: string;
  status?: "ALL" | "NEW_DM" | "ACTIVE_ALL" | string;
  disabled: boolean;
  reason?: string | null;
  dmFee?: DmFee | null;
  updatedAt: string; // ISO
}

// ─── Socket Payloads ────────────────────────────────────────────────────────

/** Client → Server: sendMessage */
export interface SendMessagePayload {
  dmId: ID;
  content: string;
  type: DmMsgType;
  gif?: string;
  txHash?: string;
  tipTxHash?: string; // voluntary tip attached to message
  voiceDuration?: number;
  replyTo?: ID; // Message._id being replied to
}

/** Client → Server: editMessage */
export interface EditMessagePayload {
  dmId: ID;
  messageId: ID;
  content: string;
}

/** Server → Client: editMessage */
export interface EditMessageResponse {
  messageId: ID;
  dmId: ID;
  content: string;
  isEdited: boolean;
  editedAt: string;
  author: "me" | "other";
}

/** Client → Server: forwardMessage */
export interface ForwardMessagePayload {
  messageId: ID;
  targetDmId: ID;
  txHash?: string;
}

/** Client → Server: deleteMessage */
export interface DeleteMessagePayload {
  dmId: ID;
  messageId: ID;
}

/** Server → Client: deleteMessage */
export interface DeleteMessageResponse {
  dmId: ID;
  messageId: ID;
}

/** Client → Server: readReceipt */
export interface ReadReceiptPayload {
  dmId: ID;
}

/** Server → Client: readReceipt */
export interface ReadReceiptResponse {
  dmId: ID;
  readBy: ID;
  count: number;
}

/** Server → Client: downloadReceipt */
export interface DownloadReceiptResponse {
  dmId: ID;
  messageId: ID;
  downloadedBy: ID;
  updated: boolean;
}

/** Client → Server: createAndStart */
export interface CreateAndStartPayload {
  _id: ID; // other user's _id
}

/** Server → Client: createAndStart */
export interface CreateAndStartResponse {
  msg: string;
  data: DmConversation & { dmFee?: DmFee };
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export interface UploadDmMediaParams {
  conversationId: ID;
  senderId: string;
  files: { uri: string; name: string; type: string }[];
  msgType?: DmMsgType;
  voiceDuration?: number;
  content?: string;
  txHash?: string;
  tipTxHash?: string; // voluntary tip tx hash
  replyTo?: ID; // Message._id being replied to
}

// ─── File Limits ────────────────────────────────────────────────────────────

export const DM_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
export const DM_VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50 MB
export const DM_VOICE_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
export const DM_VOICE_MAX_DURATION = 60; // seconds
export const DM_TEXT_MAX_LENGTH = 5000; // characters

// ─── UI Helpers ─────────────────────────────────────────────────────────────

/** Optimistic message for instant display before server confirms. */
export interface OptimisticMessage extends DmMessage {
  _optimistic: true;
  _tempId: string;
  _localMediaUri?: string;
}

/** Extract the "other" participant from a conversation for the current user. */
export function getOtherParticipant(
  conversation: DmConversation,
  myUserId?: string,
  myAddress?: string,
): DmUser | undefined {
  for (const p of conversation.participants) {
    const u = p.participant;
    if (!u) continue;
    const isMe =
      (myUserId && String(u._id) === String(myUserId)) ||
      (myAddress &&
        String(u.address || "").toLowerCase() === String(myAddress).toLowerCase());
    if (!isMe) return u;
  }
  return undefined;
}

/** Get sender as a populated DmUser (handles cases where sender is just an ID string). */
export function getSenderUser(message: DmMessage): DmUser | undefined {
  if (!message.sender) return undefined;
  if (typeof message.sender === "object" && "_id" in message.sender) {
    return message.sender;
  }
  return undefined;
}
