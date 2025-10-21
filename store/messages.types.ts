export type ID = string;

export type Presence = "online" | "offline" | "away";

export type User = {
  id: ID;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  isBlocked?: boolean;
  presence?: Presence;
  lastSeenAt?: string;
};

export type ConversationType = "direct" | "group";

export type Conversation = {
  id: ID;
  type: ConversationType;
  title?: string;
  participants: ID[];
  adminIds?: ID[];
  lastMessageId?: ID;
  unreadCount: number;
  mutedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttachmentType = "image" | "video" | "audio" | "file" | "gif";

export type Attachment = {
  id: ID;
  type: AttachmentType;
  url: string;
  previewUrl?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type Reaction = {
  emoji: string;
  userId: ID;
  createdAt: string;
};

export type MessageKind = "text" | "media" | "system"; // exclude payment

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type Message = {
  id: ID;
  tempId?: ID;
  conversationId: ID;
  senderId: ID;
  kind: MessageKind;
  text?: string;
  attachments?: Attachment[];
  reactions?: Reaction[];
  replyToId?: ID;
  status: MessageStatus;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
};

export type TypingEvent = {
  conversationId: ID;
  userId: ID;
  isTyping: boolean;
};

export type ReadReceipt = {
  conversationId: ID;
  messageId: ID;
  userId: ID;
  readAt: string;
};
