import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../libs/logger';
import type { AIChatMessage, AIPostContext } from '../services/ai.service';

const log = createLogger('useAIConversation');

export interface ConversationEntry {
  id: string;
  title: string;
  updatedAt: number;
  postId?: string;
}

export interface ConversationData {
  messages: AIChatMessage[];
  postContext?: AIPostContext;
}

const INDEX_KEY = (uid: string) => `ai_assistant_convs_${uid.toLowerCase()}`;
const DATA_KEY = (uid: string, cid: string) =>
  `ai_assistant_conv_${uid.toLowerCase()}_${cid}`;

// AskAISheet legacy prefix for scanning post-based chats
const POST_CHAT_PREFIX = 'ai_chat_';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readIndex(userId: string): Promise<ConversationEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeIndex(userId: string, entries: ConversationEntry[]) {
  await AsyncStorage.setItem(INDEX_KEY(userId), JSON.stringify(entries));
}

async function readConversation(
  userId: string,
  convId: string,
): Promise<ConversationData | null> {
  try {
    const raw = await AsyncStorage.getItem(DATA_KEY(userId, convId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeConversation(
  userId: string,
  convId: string,
  data: ConversationData,
) {
  await AsyncStorage.setItem(DATA_KEY(userId, convId), JSON.stringify(data));
}

/**
 * Scan legacy AskAISheet keys to include post-based chats in history.
 * Keys are `ai_chat_{userId}_{postId}`.
 */
async function scanPostChats(userId: string): Promise<ConversationEntry[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const prefix = `${POST_CHAT_PREFIX}${userId.toLowerCase()}_`;
    const matchingKeys = allKeys.filter((k) => k.startsWith(prefix));
    const entries: ConversationEntry[] = [];

    for (const key of matchingKeys) {
      const postId = key.slice(prefix.length);
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const messages: AIChatMessage[] = Array.isArray(parsed)
          ? parsed
          : parsed.messages || [];
        if (messages.length === 0) continue;

        const firstAssistant = messages.find((m: AIChatMessage) => m.role === 'assistant');
        const title = firstAssistant
          ? firstAssistant.content.slice(0, 60).replace(/\n/g, ' ')
          : `Post chat`;

        entries.push({
          id: `post_${postId}`,
          title,
          updatedAt: 0,
          postId,
        });
      } catch {}
    }
    return entries;
  } catch {
    return [];
  }
}

export function useAIConversation(userId: string) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [postContext, setPostContext] = useState<AIPostContext | undefined>();
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [index, postChats] = await Promise.all([
        readIndex(userId),
        scanPostChats(userId),
      ]);
      // Merge: index entries with post chats, dedup by id
      const seen = new Set(index.map((e) => e.id));
      const merged = [
        ...index,
        ...postChats.filter((p) => !seen.has(p.id)),
      ];
      merged.sort((a, b) => b.updatedAt - a.updatedAt);
      if (isMounted.current) setConversations(merged);
    } catch (err) {
      log.error('Failed to load conversations', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setPostContext(undefined);
  }, []);

  const loadConversation = useCallback(
    async (entry: ConversationEntry) => {
      if (!userId) return;

      // Post-based chats stored in legacy format
      if (entry.postId) {
        const legacyKey = `${POST_CHAT_PREFIX}${userId.toLowerCase()}_${entry.postId}`;
        try {
          const raw = await AsyncStorage.getItem(legacyKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            const msgs: AIChatMessage[] = Array.isArray(parsed)
              ? parsed
              : parsed.messages || [];
            const ctx: AIPostContext | undefined = Array.isArray(parsed)
              ? undefined
              : parsed.postContext;
            setMessages(msgs);
            setPostContext(ctx);
            setConversationId(entry.id);
          }
        } catch (err) {
          log.error('Failed to load post chat', err);
        }
        return;
      }

      // Standard conversation
      const data = await readConversation(userId, entry.id);
      if (data) {
        setMessages(data.messages);
        setPostContext(data.postContext);
        setConversationId(entry.id);
      }
    },
    [userId],
  );

  const saveMessage = useCallback(
    async (newMessages: AIChatMessage[]) => {
      if (!userId) return;
      setMessages(newMessages);

      let cid = conversationId;
      const now = Date.now();

      if (!cid) {
        cid = generateId();
        setConversationId(cid);
      }

      // Save conversation data
      await writeConversation(userId, cid, {
        messages: newMessages,
        postContext,
      });

      // Update index
      const index = await readIndex(userId);
      const existingIdx = index.findIndex((e) => e.id === cid);
      const firstUser = newMessages.find((m) => m.role === 'user');
      const title = firstUser
        ? firstUser.content.slice(0, 60).replace(/\n/g, ' ')
        : 'New conversation';

      if (existingIdx >= 0) {
        index[existingIdx].updatedAt = now;
        if (newMessages.length <= 2) index[existingIdx].title = title;
      } else {
        index.unshift({ id: cid!, title, updatedAt: now });
      }

      await writeIndex(userId, index);
      if (isMounted.current) setConversations([...index]);
    },
    [userId, conversationId, postContext],
  );

  const deleteConversation = useCallback(
    async (entry: ConversationEntry) => {
      if (!userId) return;

      if (entry.postId) {
        const legacyKey = `${POST_CHAT_PREFIX}${userId.toLowerCase()}_${entry.postId}`;
        await AsyncStorage.removeItem(legacyKey);
      } else {
        await AsyncStorage.removeItem(DATA_KEY(userId, entry.id));
      }

      const index = await readIndex(userId);
      const filtered = index.filter((e) => e.id !== entry.id);
      await writeIndex(userId, filtered);
      if (isMounted.current) setConversations(filtered);

      if (conversationId === entry.id) {
        startNewConversation();
      }
    },
    [userId, conversationId, startNewConversation],
  );

  const clearAll = useCallback(async () => {
    if (!userId) return;
    const index = await readIndex(userId);
    for (const entry of index) {
      if (entry.postId) {
        const legacyKey = `${POST_CHAT_PREFIX}${userId.toLowerCase()}_${entry.postId}`;
        await AsyncStorage.removeItem(legacyKey);
      } else {
        await AsyncStorage.removeItem(DATA_KEY(userId, entry.id));
      }
    }
    await writeIndex(userId, []);
    if (isMounted.current) {
      setConversations([]);
      startNewConversation();
    }
  }, [userId, startNewConversation]);

  return {
    conversationId,
    messages,
    conversations,
    postContext,
    loading,
    startNewConversation,
    loadConversation,
    saveMessage,
    deleteConversation,
    clearAll,
    refreshConversations,
  };
}
