import AsyncStorage from "@react-native-async-storage/async-storage";
import { proxy, subscribe, useSnapshot } from "valtio";
import type {
  ID,
  DmConversation,
  DmMessage,
  DmPeerPolicy,
  DmFee,
  OptimisticMessage,
  EditMessageResponse,
  DeleteMessageResponse,
  ReadReceiptResponse,
  DownloadReceiptResponse,
} from "../services/dm/dm.types";


export interface DmEntities {
  contactsById: Record<ID, DmConversation>;
  messagesByConversation: Record<ID, DmMessage[]>; // ascending by createdAt
  peerPoliciesByAddress: Record<string, DmPeerPolicy>;
  /** Optimistic (in-flight) messages keyed by conversationId. Survives navigation. Not persisted. */
  optimisticByConversation: Record<ID, OptimisticMessage[]>;
}

export const dmState = proxy<DmEntities>({
  contactsById: {},
  messagesByConversation: {},
  peerPoliciesByAddress: {},
  optimisticByConversation: {},
});

const confirmedFeeCache = new Map<string, { conversationId: ID; amount?: number }>();


const DM_CACHE_PREFIX = "dm-cache-v2";
let ACTIVE_STORAGE_KEY: string | null = null;

export const setDmCacheKey = (key: string | null): void => {
  ACTIVE_STORAGE_KEY = key ? `${DM_CACHE_PREFIX}:${key}` : null;
};

export const getDmCacheKey = (): string | null => ACTIVE_STORAGE_KEY;

export const hydrateDmFromStorage = async (
  keyOverride?: string | null,
): Promise<void> => {
  try {
    const key = keyOverride
      ? `${DM_CACHE_PREFIX}:${keyOverride}`
      : ACTIVE_STORAGE_KEY || DM_CACHE_PREFIX;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<DmEntities>;
    Object.assign(dmState.contactsById, data.contactsById || {});
    Object.assign(
      dmState.messagesByConversation,
      data.messagesByConversation || {},
    );
    Object.assign(
      dmState.peerPoliciesByAddress,
      data.peerPoliciesByAddress || {},
    );
  } catch {
    // noop
  }
};

const persist = async (): Promise<void> => {
  try {
    if (!ACTIVE_STORAGE_KEY) return;
    const data: Omit<DmEntities, 'optimisticByConversation'> = {
      contactsById: dmState.contactsById,
      messagesByConversation: dmState.messagesByConversation,
      peerPoliciesByAddress: dmState.peerPoliciesByAddress,
    };
    await AsyncStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // noop
  }
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
subscribe(dmState, () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persist().catch(() => {});
  }, 800);
});

export const clearDmStore = (): void => {
  dmState.contactsById = {};
  dmState.messagesByConversation = {};
  dmState.peerPoliciesByAddress = {};
  dmState.optimisticByConversation = {};
  confirmedFeeCache.clear();
};

export const clearDmStorage = async (key?: string | null): Promise<void> => {
  try {
    const k = key
      ? `${DM_CACHE_PREFIX}:${key}`
      : ACTIVE_STORAGE_KEY || DM_CACHE_PREFIX;
    await AsyncStorage.removeItem(k);
  } catch {
    // noop
  }
};


const sortAscByCreated = (a?: string, b?: string): number =>
  +new Date(a || 0) - +new Date(b || 0);

const getSenderIdStr = (m: DmMessage): string => {
  if (typeof m.sender === "object" && m.sender?._id) return String(m.sender._id);
  return String(m.sender || "");
};


export const dmActions = {
  /** Merge conversations from the contacts API. */
  upsertContacts(contacts: DmConversation[]): void {
    for (const c of contacts) {
      const prev = dmState.contactsById[c._id];
      // Normalise contact.messages → newest-first for preview
      let previewMessages = c.messages;
      if (Array.isArray(c.messages) && c.messages.length > 1) {
        previewMessages = [...c.messages].sort(
          (x, y) => +new Date(y.createdAt) - +new Date(x.createdAt),
        );
      }
      dmState.contactsById[c._id] = {
        ...(prev || {}),
        ...c,
        ...(previewMessages ? { messages: previewMessages } : {}),
      } as DmConversation;

      // Seed conversation messages
      if (Array.isArray(c.messages) && c.messages.length) {
        const existing = dmState.messagesByConversation[c._id] || [];
        const map = new Map<string, DmMessage>(
          existing.map((m) => [m._id, m]),
        );
        for (const m of c.messages) {
          const prev = map.get(m._id);
          map.set(m._id, { ...(prev || {}), ...m });
        }
        const merged = Array.from(map.values()).sort((x, y) =>
          sortAscByCreated(x.createdAt, y.createdAt),
        );
        dmState.messagesByConversation[c._id] = merged;
      }
    }
  },

  /** Merge messages into a conversation's list. */
  upsertMessages(conversationId: ID, msgs: DmMessage[]): void {
    const existing = dmState.messagesByConversation[conversationId] || [];
    const map = new Map<string, DmMessage>(existing.map((m) => [m._id, m]));

    for (const m of msgs) {
      const prev = map.get(m._id);
      const merged = { ...(prev || {}), ...m };

      // Apply cached fee confirmation that arrived before this message
      const cached = confirmedFeeCache.get(m._id);
      if (cached) {
        merged.paymentStatus = "confirmed";
        if (cached.amount != null) merged.tipAmount = cached.amount;
        confirmedFeeCache.delete(m._id);
      }
      // Protect populated mediaUrls from empty server payloads (upload pending)
      if (
        prev?.mediaUrls?.length &&
        Array.isArray(m.mediaUrls) &&
        m.mediaUrls.length === 0
      ) {
        merged.mediaUrls = prev.mediaUrls;
      }
      // Preserve local isRead:true — server may not persist read status
      if (prev?.isRead && !m.isRead) {
        merged.isRead = true;
      }
      map.set(m._id, merged);
    }

    const sorted = Array.from(map.values()).sort((x, y) =>
      sortAscByCreated(x.createdAt, y.createdAt),
    );
    dmState.messagesByConversation[conversationId] = sorted;

    // Keep contact preview in sync
    const contact = dmState.contactsById[conversationId];
    if (contact) {
      const newest = [...sorted].slice(-10).reverse();
      const lastCreatedAt = sorted.length
        ? sorted[sorted.length - 1].createdAt
        : contact.updatedAt;
      dmState.contactsById[conversationId] = {
        ...contact,
        messages: newest,
        updatedAt: lastCreatedAt || contact.updatedAt,
      };
    }
  },

  /** Apply an edit to a stored message. */
  applyEdit(edit: EditMessageResponse): void {
    const list = dmState.messagesByConversation[edit.dmId];
    if (!list) return;
    const idx = list.findIndex((m) => m._id === edit.messageId);
    if (idx < 0) return;
    list[idx] = {
      ...list[idx],
      content: edit.content,
      isEdited: true,
      editedAt: edit.editedAt,
    };
    dmState.messagesByConversation[edit.dmId] = [...list];
  },

  /** Remove a message from the store. */
  removeMessage(del: DeleteMessageResponse): void {
    const list = dmState.messagesByConversation[del.dmId];
    if (!list) return;
    dmState.messagesByConversation[del.dmId] = list.filter(
      (m) => m._id !== del.messageId,
    );
    // Also update contact preview
    const contact = dmState.contactsById[del.dmId];
    if (contact?.messages) {
      dmState.contactsById[del.dmId] = {
        ...contact,
        messages: (contact.messages || []).filter(
          (m) => m._id !== del.messageId,
        ),
      };
    }
  },

  /** Clear all messages for a conversation. */
  clearMessages(conversationId: ID): void {
    dmState.messagesByConversation[conversationId] = [];
    const contact = dmState.contactsById[conversationId];
    if (contact) {
      dmState.contactsById[conversationId] = {
        ...contact,
        messages: [],
      };
    }
  },

  /** Mark all non-mine messages read. */
  markAllRead(conversationId: ID, currentUserId?: ID): void {
    const list = dmState.messagesByConversation[conversationId];
    if (!list) return;
    let changed = false;
    const updated = list.map((m) => {
      const isMine =
        m.author === "me" ||
        (currentUserId && getSenderIdStr(m) === currentUserId);
      if (!isMine && !m.isRead) {
        changed = true;
        return { ...m, isRead: true };
      }
      return m;
    });
    if (changed) {
      dmState.messagesByConversation[conversationId] = updated;
    }
    // Always reset unreadCount on the contact — even when no messages
    // were individually toggled (server may have returned them pre-read
    // while the contact still carries a stale unreadCount from the API).
    const contact = dmState.contactsById[conversationId];
    if (contact) {
      dmState.contactsById[conversationId] = {
        ...contact,
        unreadCount: 0,
        ...(changed && contact.messages
          ? {
              messages: (contact.messages || []).map((m) => {
                const isMine =
                  (m as DmMessage).author === "me" ||
                  (currentUserId && getSenderIdStr(m as DmMessage) === currentUserId);
                return !isMine && !(m as DmMessage).isRead
                  ? { ...m, isRead: true }
                  : m;
              }),
            }
          : {}),
      };
    }
  },

  /** Apply a read receipt (other user read our messages). */
  applyReadReceipt(receipt: ReadReceiptResponse): void {
    const list = dmState.messagesByConversation[receipt.dmId];
    if (!list) return;
    // Mark our sent messages as read
    let changed = false;
    const updated = list.map((m) => {
      if (m.author === "me" && !m.isRead) {
        changed = true;
        return { ...m, isRead: true };
      }
      return m;
    });
    if (changed) {
      dmState.messagesByConversation[receipt.dmId] = updated;
    }
  },

  /** Apply a download receipt. */
  applyDownloadReceipt(receipt: DownloadReceiptResponse): void {
    const list = dmState.messagesByConversation[receipt.dmId];
    if (!list) return;
    const idx = list.findIndex((m) => m._id === receipt.messageId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], isDownloaded: true };
      dmState.messagesByConversation[receipt.dmId] = [...list];
    }
  },

  /** Apply fee/tip confirmed on-chain — flip paymentStatus to 'confirmed'. */
  applyFeeConfirmed(conversationId: ID, messageId: ID, amount?: number): void {
    let applied = false;

    // 1) Try to update in messagesByConversation
    const list = dmState.messagesByConversation[conversationId];
    if (list) {
      const idx = list.findIndex((m) => m._id === messageId);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          paymentStatus: "confirmed",
          ...(amount != null ? { tipAmount: amount } : {}),
        };
        dmState.messagesByConversation[conversationId] = [...list];
        applied = true;
      }
    }

    // 2) Also try to update any matching optimistic message
    const optList = dmState.optimisticByConversation[conversationId];
    if (optList) {
      const optIdx = optList.findIndex((m) => m._tempId === messageId || m._id === messageId);
      if (optIdx >= 0) {
        optList[optIdx] = {
          ...optList[optIdx],
          paymentStatus: "confirmed",
          ...(amount != null ? { tipAmount: amount } : {}),
        };
        dmState.optimisticByConversation[conversationId] = [...optList];
        applied = true;
      }
    }

    // 3) If the message wasn't found anywhere, cache the confirmation
    //    so upsertMessages can apply it when the server message arrives.
    if (!applied) {
      confirmedFeeCache.set(messageId, { conversationId, amount });
    }
  },

  /** Cache peer DM policy. */
  setPeerPolicy(address: string, policy: Partial<DmPeerPolicy>): void {
    if (!address) return;
    const key = address.toLowerCase();
    const prev = dmState.peerPoliciesByAddress[key] || {
      address: key,
      disabled: false,
      updatedAt: new Date().toISOString(),
    };
    dmState.peerPoliciesByAddress[key] = {
      ...prev,
      ...policy,
      address: key,
      updatedAt: new Date().toISOString(),
    };
  },


  /** Add an optimistic message (newest-first order). */
  addOptimistic(conversationId: ID, msg: OptimisticMessage): void {
    const list = dmState.optimisticByConversation[conversationId] || [];
    dmState.optimisticByConversation[conversationId] = [msg, ...list];
  },

  /** Remove an optimistic message by tempId (after server confirms). */
  removeOptimistic(conversationId: ID, tempId: string): void {
    const list = dmState.optimisticByConversation[conversationId];
    if (!list) return;
    dmState.optimisticByConversation[conversationId] = list.filter(
      (m) => m._tempId !== tempId,
    );
  },

  /** Mark an optimistic message as failed. */
  failOptimistic(conversationId: ID, tempId: string, reason?: string): void {
    const list = dmState.optimisticByConversation[conversationId];
    if (!list) return;
    dmState.optimisticByConversation[conversationId] = list.map((m) =>
      m._tempId === tempId
        ? { ...m, uploadStatus: "failed" as const, failureReason: reason }
        : m,
    );
  },

  /** Remove a conversation entirely from local state (after permanent delete). */
  removeConversation(conversationId: ID): void {
    delete dmState.contactsById[conversationId];
    delete dmState.messagesByConversation[conversationId];
    delete dmState.optimisticByConversation[conversationId];
  },

  /** Update conversationId for all optimistic messages (used when conversation is created mid-send). */
  migrateOptimistic(fromConvId: ID, toConvId: ID): void {
    const list = dmState.optimisticByConversation[fromConvId];
    if (!list?.length) return;
    const existing = dmState.optimisticByConversation[toConvId] || [];
    dmState.optimisticByConversation[toConvId] = [
      ...list.map((m) => ({ ...m, conversation: toConvId })),
      ...existing,
    ];
    delete dmState.optimisticByConversation[fromConvId];
  },
};


export const useDmContacts = (): DmConversation[] => {
  const snap = useSnapshot(dmState);
  return Object.values(snap.contactsById)
    .slice()
    .sort(
      (a, b) =>
        +new Date(b.updatedAt || b.lastMessageAt || 0) -
        +new Date(a.updatedAt || a.lastMessageAt || 0),
    ) as DmConversation[];
};

export const useDmMessages = (conversationId: ID): DmMessage[] => {
  const snap = useSnapshot(dmState);
  return [...((snap.messagesByConversation[conversationId] || []) as DmMessage[])];
};

/** Return optimistic (in-flight) messages for a conversation. Newest first. */
export const useOptimisticMessages = (conversationId: ID): OptimisticMessage[] => {
  const snap = useSnapshot(dmState);
  return [...((snap.optimisticByConversation[conversationId] || []) as OptimisticMessage[])];
};

export const getUnreadCount = (
  conversationId: ID,
  currentUserId?: ID,
): number => {
  // Prefer the server-provided unreadCount on the contact
  const contact = dmState.contactsById[conversationId];
  if (contact?.unreadCount !== undefined) return contact.unreadCount;
  // Fallback: count locally
  const list =
    dmState.messagesByConversation[conversationId] ||
    contact?.messages ||
    [];
  let count = 0;
  for (const m of list) {
    const isMine =
      (m as DmMessage).author === "me" ||
      (currentUserId && getSenderIdStr(m as DmMessage) === currentUserId);
    if (!isMine && !(m as DmMessage).isRead) count++;
  }
  return count;
};

export const useUnreadCount = (
  conversationId: ID,
  currentUserId?: ID,
): number => {
  const snap = useSnapshot(dmState);
  const contact = snap.contactsById[conversationId] as DmConversation | undefined;
  if (contact?.unreadCount !== undefined) return contact.unreadCount;
  const list =
    (snap.messagesByConversation[conversationId] as DmMessage[] | undefined) ||
    contact?.messages ||
    [];
  let count = 0;
  for (const m of list) {
    const isMine =
      (m as DmMessage).author === "me" ||
      (currentUserId && getSenderIdStr(m as DmMessage) === currentUserId);
    if (!isMine && !(m as DmMessage).isRead) count++;
  }
  return count;
};

export const useUnreadConversationsCount = (currentUserId?: ID): number => {
  const snap = useSnapshot(dmState);
  let total = 0;
  for (const convId of Object.keys(snap.contactsById)) {
    const contact = snap.contactsById[convId] as DmConversation | undefined;
    if (contact?.unreadCount !== undefined) {
      if (contact.unreadCount > 0) total++;
      continue;
    }
    const list =
      (snap.messagesByConversation[convId] as DmMessage[] | undefined) ||
      contact?.messages ||
      [];
    for (const m of list) {
      const isMine =
        (m as DmMessage).author === "me" ||
        (currentUserId && getSenderIdStr(m as DmMessage) === currentUserId);
      if (!isMine && !(m as DmMessage).isRead) {
        total++;
        break;
      }
    }
  }
  return total;
};

export const getPeerPolicy = (
  address?: string | null,
): DmPeerPolicy | undefined => {
  if (!address) return undefined;
  return dmState.peerPoliciesByAddress[address.toLowerCase()];
};

export const usePeerPolicy = (
  address?: string | null,
): DmPeerPolicy | undefined => {
  const snap = useSnapshot(dmState);
  if (!address) return undefined;
  return snap.peerPoliciesByAddress[
    address.toLowerCase()
  ] as DmPeerPolicy | undefined;
};
