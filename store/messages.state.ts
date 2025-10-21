import AsyncStorage from '@react-native-async-storage/async-storage';
import { proxy, subscribe, useSnapshot } from 'valtio';
import { Conversation, ID, Message, ReadReceipt, TypingEvent, User } from './messages.types';
import { createLogger } from '../libs/logger';

const log = createLogger('MsgStore');

export type Entities = {
  users: Record<ID, User>;
  conversations: Record<ID, Conversation>;
  messagesByConversation: Record<ID, Record<ID, Message>>; // map by id for de-dupe
  orderByConversation: Record<ID, ID[]>; // message ids sorted ascending by createdAt
  typingByConversation: Record<ID, Record<ID, number>>; // userId -> lastTypingAt ms
  lastReadByConversation: Record<ID, ID | undefined>;
};

export const state = proxy<Entities>({
  users: {},
  conversations: {},
  messagesByConversation: {},
  orderByConversation: {},
  typingByConversation: {},
  lastReadByConversation: {},
});

// Persistence (lightweight)
const STORAGE_KEY = 'msg-cache-v1';
export async function hydrateFromStorage() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<Entities>;
    Object.assign(state.users, data.users || {});
    Object.assign(state.conversations, data.conversations || {});
    Object.assign(state.messagesByConversation, data.messagesByConversation || {});
    Object.assign(state.orderByConversation, data.orderByConversation || {});
    Object.assign(state.typingByConversation, data.typingByConversation || {});
    Object.assign(state.lastReadByConversation, data.lastReadByConversation || {});
    log.info('hydrated cache');
  } catch (e) {
    log.warn('hydrate failed', e);
  }
}

let persistTimer: any = null;
subscribe(state, () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist().catch(() => {}), 800);
});

async function persist() {
  try {
    const data: Entities = {
      users: state.users,
      conversations: state.conversations,
      messagesByConversation: state.messagesByConversation,
      orderByConversation: state.orderByConversation,
      typingByConversation: state.typingByConversation,
      lastReadByConversation: state.lastReadByConversation,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    log.warn('persist failed', e);
  }
}

// Helpers
function ensureMsgMaps(convId: ID) {
  if (!state.messagesByConversation[convId]) state.messagesByConversation[convId] = {};
  if (!state.orderByConversation[convId]) state.orderByConversation[convId] = [];
}

export const actions = {
  upsertUsers(users: User[]) {
    for (const u of users) state.users[u.id] = { ...(state.users[u.id] || {}), ...u };
  },

  upsertConversations(convs: Conversation[]) {
    for (const c of convs) state.conversations[c.id] = { ...(state.conversations[c.id] || {}), ...c };
  },

  upsertMessages(messages: Message[]) {
    for (const m of messages) {
      ensureMsgMaps(m.conversationId);
      const map = state.messagesByConversation[m.conversationId];
      const existed = map[m.id] || (m.tempId ? map[m.tempId] : undefined);
      if (m.tempId && map[m.tempId]) {
        // Replace tempId entry
        delete map[m.tempId];
      }
      map[m.id] = { ...(existed || {}), ...m };
      // maintain order
      const order = state.orderByConversation[m.conversationId];
      if (!order.includes(m.id)) {
        order.push(m.id);
        order.sort((a, b) => {
          const am = map[a];
          const bm = map[b];
          const at = +new Date(am?.createdAt || 0);
          const bt = +new Date(bm?.createdAt || 0);
          return at - bt;
        });
      }
      // update lastMessageId + updatedAt
      const conv = state.conversations[m.conversationId];
      if (conv) {
        conv.lastMessageId = m.id;
        conv.updatedAt = new Date().toISOString();
      }
    }
  },

  optimisticSend(params: { conversationId: ID; senderId: ID; text: string; tempId: ID }) {
    const now = new Date().toISOString();
    const msg: Message = {
      id: params.tempId,
      tempId: params.tempId,
      conversationId: params.conversationId,
      senderId: params.senderId,
      kind: 'text',
      text: params.text,
      status: 'sending',
      createdAt: now,
    };
    actions.upsertMessages([msg]);
  },

  applyAck(tempId: ID, message: Message) {
    // Replace by real id
    const convId = message.conversationId;
    ensureMsgMaps(convId);
    const map = state.messagesByConversation[convId];
    if (map[tempId]) delete map[tempId];
    map[message.id] = message;
    const order = state.orderByConversation[convId];
    const idx = order.indexOf(tempId);
    if (idx >= 0) order[idx] = message.id; else if (!order.includes(message.id)) order.push(message.id);
  },

  updateMessage(message: Message) {
    actions.upsertMessages([message]);
  },

  setTyping(ev: TypingEvent) {
    const { conversationId, userId, isTyping } = ev;
    const now = Date.now();
    if (!state.typingByConversation[conversationId]) state.typingByConversation[conversationId] = {};
    if (isTyping) state.typingByConversation[conversationId][userId] = now;
    else delete state.typingByConversation[conversationId][userId];
  },

  applyRead(receipt: ReadReceipt) {
    state.lastReadByConversation[receipt.conversationId] = receipt.messageId;
    const conv = state.conversations[receipt.conversationId];
    if (conv) conv.unreadCount = 0;
  },

  markConversationRead(convId: ID, lastMessageId?: ID) {
    state.lastReadByConversation[convId] = lastMessageId;
    const conv = state.conversations[convId];
    if (conv) conv.unreadCount = 0;
  },
};

export function useConversationList(): Array<Conversation> {
  const snap = useSnapshot(state);
  return useMemoSortedConversations(snap.conversations as any);
}

function useMemoSortedConversations(conversations: Readonly<Record<ID, Conversation>>): Conversation[] {
  const items = Object.values(conversations as any) as Conversation[];
  items.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  return items;
}

export function useMessages(convId: ID): Message[] {
  const snap = useSnapshot(state);
  const map = snap.messagesByConversation[convId] || {};
  const order = snap.orderByConversation[convId] || [];
  return order.map((id) => map[id]).filter(Boolean) as Message[];
}

export function selectConversation(convId: ID): Conversation | undefined {
  return state.conversations[convId];
}

export function getUser(id: ID): User | undefined {
  return state.users[id];
}

export function useTyping(convId: ID): string[] {
  const snap = useSnapshot(state);
  const map = snap.typingByConversation[convId] || {};
  const cutoff = Date.now() - 5000; // auto-stop after 5s
  return Object.entries(map)
    .filter(([, ts]) => ts > cutoff)
    .map(([uid]) => snap.users[uid]?.displayName || 'Someone');
}
