import AsyncStorage from '@react-native-async-storage/async-storage';
import { proxy, subscribe, useSnapshot } from 'valtio';

export type ID = string;

export type DmUser = {
  _id: ID;
  username?: string;
  address?: string;
  displayName?: string;
  avatarImageUrl?: string;
};

export type DmParticipant = {
  participant: DmUser;
  role?: string;
};

export type DmTip = {
  _id: ID; // tipBy
  totalTip: number;
  userDetails?: DmUser;
};

export type DmMessage = {
  _id: ID;
  conversation: ID;
  sender: DmUser | ID; // aggregate may populate
  author?: 'me' | 'other';
  content?: string;
  msgType?: string;
  mediaUrls?: Array<{ url: string; _id?: ID } | string>;
  isRead?: boolean;
  isPaid?: boolean;
  createdAt: string;
  updatedAt?: string;
  [key: string]: any;
};

export type DmContact = {
  _id: ID;
  conversationType: 'dm' | 'group';
  groupName?: string;
  description?: string;
  iconUrl?: string;
  participants: DmParticipant[];
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  blockList?: any[];
  tips?: DmTip[];
  messages?: DmMessage[]; // last N messages from pipeline
};

export type DmEntities = {
  contactsById: Record<ID, DmContact>;
  messagesByConversation: Record<ID, DmMessage[]>; // sorted ascending by createdAt
  peerPoliciesByAddress: Record<string, DmPeerPolicy>;
};

export type DmPeerPolicy = {
  address: string;
  status?: 'ALL' | 'NEW_DM' | 'ACTIVE_ALL' | string;
  disabled: boolean;
  reason?: string | null;
  updatedAt: string; // ISO
};

export const dmState = proxy<DmEntities>({
  contactsById: {},
  messagesByConversation: {},
  peerPoliciesByAddress: {},
});

// Persistence (lightweight) with multi-account cache keys
const DM_CACHE_PREFIX = 'dm-cache-v1';
let ACTIVE_STORAGE_KEY: string | null = null;

export function setDmCacheKey(key: string | null) {
  ACTIVE_STORAGE_KEY = key ? `${DM_CACHE_PREFIX}:${key}` : null;
}

export function getDmCacheKey(): string | null {
  return ACTIVE_STORAGE_KEY;
}

export async function hydrateDmFromStorage(keyOverride?: string | null) {
  try {
    const key = keyOverride ? `${DM_CACHE_PREFIX}:${keyOverride}` : (ACTIVE_STORAGE_KEY || DM_CACHE_PREFIX);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<DmEntities>;
    Object.assign(dmState.contactsById, data.contactsById || {});
    Object.assign(dmState.messagesByConversation, data.messagesByConversation || {});
    Object.assign(dmState.peerPoliciesByAddress, data.peerPoliciesByAddress || {});
  } catch (e) {
    // noop
  }
}

let persistTimer: any = null;
subscribe(dmState, () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist().catch(() => {}), 800);
});

async function persist() {
  try {
    if (!ACTIVE_STORAGE_KEY) return; // do not persist without an active account key
    const data: DmEntities = {
      contactsById: dmState.contactsById,
      messagesByConversation: dmState.messagesByConversation,
      peerPoliciesByAddress: dmState.peerPoliciesByAddress,
    };
    await AsyncStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // noop
  }
}

export async function clearDmStore() {
  try {
    dmState.contactsById = {} as any;
    dmState.messagesByConversation = {} as any;
  } catch (e) {
    // noop
  }
}

export async function clearDmStorage(key?: string | null) {
  try {
    const k = key ? `${DM_CACHE_PREFIX}:${key}` : (ACTIVE_STORAGE_KEY || DM_CACHE_PREFIX);
    await AsyncStorage.removeItem(k);
  } catch (e) {
    // noop
  }
}

// Helpers
function sortAscByCreated(a?: string, b?: string) {
  return +new Date(a || 0) - +new Date(b || 0);
}

export const dmActions = {
  upsertContacts(contacts: DmContact[]) {
    for (const c of contacts) {
      const prev = dmState.contactsById[c._id] || ({} as DmContact);
      // Normalize contact.messages to newest-first for UI preview consistency
      let newestFirst: DmMessage[] | undefined = undefined;
      if (Array.isArray(c.messages) && c.messages.length) {
        const sortedDesc = [...c.messages].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt));
        newestFirst = sortedDesc;
      }
      dmState.contactsById[c._id] = { ...prev, ...c, ...(newestFirst ? { messages: newestFirst as any } : {}) } as DmContact;
      // If payload includes messages, seed them
      if (Array.isArray(c.messages) && c.messages.length) {
        const existing = dmState.messagesByConversation[c._id] || [];
        const merged = [...existing];
        for (const m of c.messages) {
          const idx = merged.findIndex((x) => x._id === m._id);
          if (idx >= 0) merged[idx] = { ...merged[idx], ...m };
          else merged.push(m);
        }
        merged.sort((x, y) => sortAscByCreated(x.createdAt, y.createdAt));
        dmState.messagesByConversation[c._id] = merged;
      }
    }
  },

  upsertMessages(conversationId: ID, msgs: DmMessage[]) {
    const existing = dmState.messagesByConversation[conversationId] || [];
    const map = new Map<string, DmMessage>(existing.map((m) => [m._id, m]));
    for (const m of msgs) {
      const prev = map.get(String(m._id));
      const merged_msg = { ...(prev || {}), ...m };
      // Protect local/populated mediaUrls from being overwritten by empty server payloads
      // (server creates media messages with uploadStatus:'pending' and empty mediaUrls;
      // the real URLs arrive later via JobMessageId)
      if (
        prev &&
        Array.isArray(prev.mediaUrls) &&
        (prev.mediaUrls as any[]).length > 0 &&
        Array.isArray(m.mediaUrls) &&
        (m.mediaUrls as any[]).length === 0
      ) {
        merged_msg.mediaUrls = prev.mediaUrls;
      }
      map.set(String(m._id), merged_msg);
    }
    const merged = Array.from(map.values());
    merged.sort((x, y) => sortAscByCreated(x.createdAt, y.createdAt));
    dmState.messagesByConversation[conversationId] = merged;
    // Keep contact preview in sync (newest-first slice)
    const contact = dmState.contactsById[conversationId];
    if (contact) {
      const newestFirst = [...merged].slice(-10).reverse();
      const lastCreatedAt = merged.length ? merged[merged.length - 1].createdAt : contact.updatedAt;
      dmState.contactsById[conversationId] = {
        ...contact,
        messages: newestFirst as any,
        updatedAt: lastCreatedAt || contact.updatedAt,
      } as DmContact;
    }
  },

  markAllRead(conversationId: ID, currentUserId?: ID) {
    const list = dmState.messagesByConversation[conversationId] || [];
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const senderStr = String(((m as any).sender as any)?._id || (m as any).sender || '');
      const isMine = m.author === 'me' || (!!currentUserId && senderStr === String(currentUserId));
      if (!isMine && m.isRead !== true) {
        list[i] = { ...m, isRead: true };
        changed = true;
      }
    }
    if (changed) {
      dmState.messagesByConversation[conversationId] = [...list];
    }
    // Also update any inlined messages cached under the contact (if present)
    const contact = dmState.contactsById[conversationId];
    if (contact && Array.isArray(contact.messages) && contact.messages.length) {
      const updated = contact.messages.map((m) => {
        const senderStr = String((((m as any).sender as any)?._id || (m as any).sender) || '');
        const isMine = (m as any).author === 'me' || (!!currentUserId && senderStr === String(currentUserId));
        return !isMine && (m as any).isRead !== true ? { ...(m as any), isRead: true } : m;
      });
      dmState.contactsById[conversationId] = { ...contact, messages: updated } as DmContact;
    }
  },

  setPeerPolicy(address: string, policy: Partial<DmPeerPolicy>) {
    if (!address) return;
    const key = String(address).toLowerCase();
    const prev = dmState.peerPoliciesByAddress[key] || ({ address: key, disabled: false, updatedAt: new Date().toISOString() } as DmPeerPolicy);
    dmState.peerPoliciesByAddress[key] = {
      ...prev,
      ...policy,
      address: key,
      updatedAt: new Date().toISOString(),
    } as DmPeerPolicy;
  },
};

// Selectors
export function useDmContacts(): DmContact[] {
  const snap = useSnapshot(dmState);
  const items = Object.values(snap.contactsById) as DmContact[];
  return [...items].sort(
    (a, b) => +new Date(b.updatedAt || b.lastMessageAt || 0) - +new Date(a.updatedAt || a.lastMessageAt || 0)
  );
}

export function useDmMessages(conversationId: ID): DmMessage[] {
  const snap = useSnapshot(dmState);
  const list = (snap.messagesByConversation[conversationId] || []) as DmMessage[];
  return [...list];
}

// Derived unread helpers
export function getUnreadCount(conversationId: ID, currentUserId?: ID): number {
  const list = dmState.messagesByConversation[conversationId] || dmState.contactsById[conversationId]?.messages || [];
  let count = 0;
  for (const m of list) {
    const senderStr = String((((m as any).sender as any)?._id || (m as any).sender) || '');
    const isMine = (m as any).author === 'me' || (!!currentUserId && senderStr === String(currentUserId));
    if (!isMine && (m as any).isRead !== true) count++;
  }
  return count;
}

export function useUnreadCount(conversationId: ID, currentUserId?: ID): number {
  const snap = useSnapshot(dmState);
  let count = 0;
  const list = snap.messagesByConversation[conversationId] || snap.contactsById[conversationId]?.messages || [];
  for (const m of list) {
    const senderStr = String((((m as any).sender as any)?._id || (m as any).sender) || '');
    const isMine = (m as any).author === 'me' || (!!currentUserId && senderStr === String(currentUserId));
    if (!isMine && (m as any).isRead !== true) count++;
  }
  return count;
}

// Total conversations that have at least one unread message from the other user
export function getUnreadConversationsCount(currentUserId?: ID): number {
  const ids = Object.keys(dmState.contactsById);
  let total = 0;
  for (const convId of ids) {
    if (getUnreadCount(convId, currentUserId) > 0) total++;
  }
  return total;
}

export function useUnreadConversationsCount(currentUserId?: ID): number {
  const snap = useSnapshot(dmState);
  const ids = Object.keys(snap.contactsById);
  let total = 0;
  for (const convId of ids) {
    const list = (snap.messagesByConversation[convId] || snap.contactsById[convId]?.messages || []) as any[];
    let hasUnread = false;
    for (const m of list) {
      const senderStr = String((((m as any).sender as any)?._id || (m as any).sender) || '');
      const isMine = (m as any).author === 'me' || (!!currentUserId && senderStr === String(currentUserId));
      if (!isMine && (m as any).isRead !== true) {
        hasUnread = true;
        break;
      }
    }
    if (hasUnread) total++;
  }
  return total;
}

// Peer policy selectors
export function getPeerPolicy(address?: string | null): DmPeerPolicy | undefined {
  if (!address) return undefined;
  return dmState.peerPoliciesByAddress[String(address).toLowerCase()];
}

export function usePeerPolicy(address?: string | null): DmPeerPolicy | undefined {
  const snap = useSnapshot(dmState);
  if (!address) return undefined;
  return snap.peerPoliciesByAddress[String(address).toLowerCase()];
}
