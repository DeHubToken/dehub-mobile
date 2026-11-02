

import type { DmVideoOptions } from "../../libs/dm-video-options";
import type { DmDestruct, DmDestructChoice } from "../../libs/dm-destruct";
import type { MediaDescriptor } from "../../libs/dm-e2ee/media";

export type ID = string;


/** Populated user reference returned by the backend inside messages & participants. */
export interface DmUser {
  _id: ID;
  username?: string;
  address?: string;
  displayName?: string;
  avatarImageUrl?: string;
  /** Backend-computed holdings used by the shared staking badge resolver. */
  badgeBalance?: number | string | null;
  /** Grandfathered badge tier, when the live ladder has moved since purchase. */
  badgeLock?: { tier: string; requirement: number } | null;
  /** Older account payloads may expose stake totals instead of badgeBalance. */
  stakedDHB?: number | string | null;
  staked?: number | string | null;
}


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
  pinnedMessages?: string[]; // server-persisted pinned message IDs
}


/** Populated reply-to preview returned by the backend (via $lookup). */
export interface ReplyPreview {
  _id: ID;
  content: string; // truncated to 200 chars server-side
  msgType: DmMsgType;
  mediaUrls: DmMediaUrl[]; // first item only
  voiceDuration: number | null;
  /** Set client-side when the replied-to line is an encrypted attachment. */
  encMedia?: MediaDescriptor | null;
  sender: {
    _id: ID;
    username: string;
    address: string;
    displayName: string;
    avatarImageUrl: string;
  };
}


export type DmMsgType = "msg" | "media" | "gif" | "voice" | "tip" | "poll";

// ─── Poll types ────────────────────────────────────────────────────────

export interface PollOption {
  index: number;
  text: string;
  voteCount: number;
}

export interface PollUserVote {
  optionIndexes: number[];
}

export interface DmPoll {
  _id: string;
  tokenId: number;
  question: string;
  options: PollOption[];
  totalVotes: number;
  isActive: boolean;
  isExpired?: boolean;
  expiresAt?: string;
  isMultipleChoice?: boolean;
  userVote?: PollUserVote;
  address: string;
  createdAt: string;
}

/** Poll data carried on a DmMessage when msgType === 'poll' */
export interface PollAttachment {
  tokenId: number;
  question: string;
  options: { index: number; text: string }[];
  isMultipleChoice?: boolean;
  expiresAt?: string;
}

export interface DmMediaUrl {
  url: string;
  /** 'image' | 'video' | 'audio' | 'gif' | 'file' */
  type?: string;
  mimeType?: string;
  /** Documents only — the sender's filename, not recoverable from the CDN key. */
  name?: string;
  /** Documents only — bytes. */
  size?: number;
  /** End-to-end encrypted blob; the key and real type live in the message's `encMedia`. */
  encrypted?: boolean;
  _id?: ID;
}

export interface DmForwardedFrom {
  conversationId: ID;
  messageId: ID;
}

/**
 * A photo or video put behind a price (pay to unlock). The real file is only
 * ever in `mediaUrl`, for the sender or a buyer; `mediaUrls[0]` is always the
 * blurred preview.
 */
export interface DmLock {
  price: number;
  symbol: string;
  kind: "image" | "video";
  previewUrl: string | null;
  unlocked: boolean;
  mine?: boolean;
  /** False while the upload is still being processed. */
  ready?: boolean;
  unlockCount?: number;
  mediaUrl?: string;
  mediaUrlExpiresAt?: string;
}

export interface DmLockStatus {
  messageId: string;
  conversationId: string;
  /** Who the unlock payment goes to (the sender). */
  payTo: string;
  lock: DmLock;
  pendingTxHash?: string;
  status?: "unlocked" | "pending";
}

/** A single DM message. */
export interface DmMessage {
  _id: ID;
  conversation: ID;
  sender: DmUser | ID; // aggregate may populate
  author?: "me" | "other";
  content?: string;
  /** Set once an `e2e:` envelope has been opened (or failed to open) client-side. */
  encrypted?: boolean;
  /** Encrypted, but this device holds no key for it — render a placeholder, never the envelope. */
  undecryptable?: boolean;
  /**
   * Opened client-side from an encrypted attachment's descriptor: the file
   * key, real type and layout. `content` then holds only its caption.
   */
  encMedia?: MediaDescriptor | null;
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

  // Poll metadata (only populated when msgType === 'poll')
  poll?: PollAttachment | null;

  /** Emoji -> lowercase wallet addresses that reacted with it. */
  reactions?: Record<string, string[]>;

  /** Set for a locked (pay-to-unlock) photo or video. */
  lock?: DmLock | null;
  /** How a plain video plays (trim, cover, mirror, rotate, hide until tapped). */
  mediaOptions?: DmVideoOptions | null;
  /** Self-destruct: gone after a set time, or once the other person watched it. */
  destruct?: DmDestruct | null;
}

/** Server -> Client: reactionUpdated (the message's full reaction map). */
export interface ReactionUpdatedPayload {
  dmId: ID;
  messageId: ID;
  reactions: Record<string, string[]>;
}


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


export interface DmPeerPolicy {
  address: string;
  status?: "ALL" | "NEW_DM" | "ACTIVE_ALL" | string;
  disabled: boolean;
  reason?: string | null;
  dmFee?: DmFee | null;
  updatedAt: string; // ISO
}


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
  /** The file is an end-to-end encrypted blob of this kind; `content` must then be an envelope. */
  encryptedKind?: "image" | "video" | "audio" | "file";
  /** Pay-to-unlock price (DHB). Never combined with encryptedKind. */
  lockPrice?: number;
  /** Video trim/cover/mirror/rotate/hide, for an attachment sent in the clear. */
  mediaOptions?: DmVideoOptions;
  /** Self-destruct choice; works for encrypted files too (only the timer is in the clear). */
  destruct?: DmDestructChoice;
}


export const DM_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
export const DM_VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50 MB
export const DM_VOICE_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
export const DM_VOICE_MAX_DURATION = 60; // seconds
export const DM_TEXT_MAX_LENGTH = 5000; // characters


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

  // Some contacts responses populate only the current participant but still
  // include recent messages. Recover the peer from those populated senders so
  // the row can show the same identity data as web instead of "Unknown".
  for (const message of conversation.messages || []) {
    const u = getSenderUser(message);
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
