/**
 * Assistant conversation storage.
 * ===============================
 * Two tiers, and both matter:
 *
 *  - **AsyncStorage** stays the primary read. It is instant, it works offline,
 *    and it is where every conversation this app has ever saved already lives.
 *  - **Supabase** (`ai_conversations` / `ai_messages`) is what web writes to, so
 *    mirroring there is what makes a thread started on the desktop appear on the
 *    phone and vice versa. That was the whole gap: history was device-local, so
 *    the two apps showed different lists for the same account.
 *
 * Same shape as `useDrafts`: every remote call fails soft, so a signed-out or
 * offline user gets exactly the behaviour this hook had before the mirror
 * existed. Nothing here surfaces a remote error to the caller.
 *
 * Media follows web: a `data:` URL is uploaded to the public
 * `ai-media-uploads` bucket and the row stores the resulting https URL. Writing
 * the data URL into the row instead would put a multi-megabyte string in the
 * database and break the web client's own history view.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { withWalletHeader } from '../libs/supabase-wallet-client';
import { materialise } from '../libs/assistantMedia';
import { createLogger } from '../libs/logger';
import type { AIChatMessage, AIPostContext } from '../services/ai.service';

const log = createLogger('useAIConversation');

export interface ConversationEntry {
  id: string;
  title: string;
  updatedAt: number;
  postId?: string;
  /** `ai_conversations.id`, once this thread has been mirrored. */
  remoteId?: string;
  /** True for a thread that only exists on the server (started on web). */
  remoteOnly?: boolean;
}

export interface ConversationData {
  messages: AIChatMessage[];
  postContext?: AIPostContext;
  remoteId?: string;
}

const INDEX_KEY = (uid: string) => `ai_assistant_convs_${uid.toLowerCase()}`;
const DATA_KEY = (uid: string, cid: string) =>
  `ai_assistant_conv_${uid.toLowerCase()}_${cid}`;

// AskAISheet legacy prefix for scanning post-based chats
const POST_CHAT_PREFIX = 'ai_chat_';

/** How many remote threads the history sheet lists, matching web's limit. */
const REMOTE_LIMIT = 50;

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

/* ── Supabase mirror ─────────────────────────────────────────────────────── */

/**
 * Upload a `data:` URL and return its public https URL. Anything already
 * addressable passes through; a failure returns null so the row is still
 * written, just without the media.
 */
async function persistMediaUrl(
  url: string | undefined | null,
  kind: 'image' | 'video' | 'audio',
): Promise<string | null> {
  if (!url) return null;
  if (!url.startsWith('data:')) return url;
  try {
    const local = await materialise(url, kind);
    const blob = await (await fetch(local)).blob();
    const ext = local.split('.').pop() || (kind === 'video' ? 'mp4' : 'png');
    const path = `assistant/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('ai-media-uploads')
      .upload(path, blob, { contentType: blob.type || undefined, upsert: false });
    if (error) throw error;
    return supabase.storage.from('ai-media-uploads').getPublicUrl(path).data.publicUrl;
  } catch (err) {
    log.error('media upload failed:', err);
    return null;
  }
}

async function createRemoteConversation(
  wallet: string,
  firstMessage: string,
): Promise<string | null> {
  try {
    const title =
      firstMessage.length > 50 ? `${firstMessage.substring(0, 50)}...` : firstMessage;
    const { data, error } = await withWalletHeader(
      supabase
        .from('ai_conversations')
        .insert({ wallet_address: wallet.toLowerCase(), title })
        .select('id')
        .single(),
      wallet,
    );
    if (error) throw error;
    return data?.id ?? null;
  } catch (err) {
    log.error('remote conversation create failed:', err);
    return null;
  }
}

async function appendRemoteMessage(
  wallet: string,
  remoteId: string,
  message: AIChatMessage,
): Promise<void> {
  try {
    const [imageUrl, videoUrl, audioUrl] = await Promise.all([
      persistMediaUrl(message.imageUrl, 'image'),
      persistMediaUrl(message.videoUrl, 'video'),
      persistMediaUrl(message.audioUrl, 'audio'),
    ]);

    const { error } = await withWalletHeader(
      supabase.from('ai_messages').insert({
        conversation_id: remoteId,
        role: message.role,
        // The column is NOT NULL and an image-only turn has no text, which is
        // why web writes this placeholder rather than an empty string.
        content: message.content || '(image)',
        image_url: imageUrl,
        video_url: videoUrl,
        audio_url: audioUrl,
        attached_image: message.attachedImage || null,
      }),
      wallet,
    );
    if (error) throw error;

    await withWalletHeader(
      supabase
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', remoteId),
      wallet,
    );
  } catch (err) {
    log.error('remote message append failed:', err);
  }
}

async function fetchRemoteConversations(wallet: string): Promise<ConversationEntry[]> {
  try {
    const { data, error } = await withWalletHeader(
      supabase
        .from('ai_conversations')
        .select('id, title, updated_at')
        .order('updated_at', { ascending: false })
        .limit(REMOTE_LIMIT),
      wallet,
    );
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: `remote_${row.id}`,
      remoteId: row.id,
      remoteOnly: true,
      title: row.title || 'Conversation',
      updatedAt: row.updated_at ? Date.parse(row.updated_at) : 0,
    }));
  } catch (err) {
    log.error('remote conversation list failed:', err);
    return [];
  }
}

async function fetchRemoteMessages(
  wallet: string,
  remoteId: string,
): Promise<AIChatMessage[]> {
  try {
    const { data, error } = await withWalletHeader(
      supabase
        .from('ai_messages')
        .select('role, content, image_url, video_url, audio_url, attached_image, created_at')
        .eq('conversation_id', remoteId)
        .order('created_at', { ascending: true }),
      wallet,
    );
    if (error) throw error;
    return (data || []).map((row: any) => ({
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content === '(image)' ? '' : row.content || '',
      ...(row.image_url ? { imageUrl: row.image_url } : {}),
      ...(row.video_url ? { videoUrl: row.video_url } : {}),
      ...(row.audio_url ? { audioUrl: row.audio_url } : {}),
      ...(row.attached_image ? { attachedImage: row.attached_image } : {}),
    })) as AIChatMessage[];
  } catch (err) {
    log.error('remote message fetch failed:', err);
    return [];
  }
}

export interface AssistantMediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  conversationId: string;
  createdAt: string;
}

/**
 * Everything the assistant has generated for this account, newest first — the
 * media tab web's history drawer opens with. Reads the server rather than the
 * local index so media made on the desktop shows up too.
 */
export async function fetchAssistantMedia(wallet: string): Promise<AssistantMediaItem[]> {
  try {
    const { data: convs, error: convError } = await withWalletHeader(
      supabase
        .from('ai_conversations')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(REMOTE_LIMIT),
      wallet,
    );
    if (convError) throw convError;
    const ids = (convs || []).map((row: any) => row.id);
    if (ids.length === 0) return [];

    const { data, error } = await withWalletHeader(
      supabase
        .from('ai_messages')
        .select('id, image_url, video_url, audio_url, conversation_id, created_at')
        .in('conversation_id', ids)
        .or('image_url.neq.,video_url.neq.,audio_url.neq.')
        .order('created_at', { ascending: false })
        .limit(200),
      wallet,
    );
    if (error) throw error;

    const items: AssistantMediaItem[] = [];
    for (const row of data || []) {
      const base = { conversationId: row.conversation_id, createdAt: row.created_at };
      if (row.image_url) {
        items.push({ id: `${row.id}-img`, url: row.image_url, type: 'image', ...base });
      }
      if (row.video_url) {
        items.push({ id: `${row.id}-vid`, url: row.video_url, type: 'video', ...base });
      }
      if (row.audio_url) {
        items.push({ id: `${row.id}-aud`, url: row.audio_url, type: 'audio', ...base });
      }
    }
    return items;
  } catch (err) {
    log.error('media fetch failed:', err);
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
  /** Remote id for the open thread, so each turn appends to the same row set. */
  const remoteIdRef = useRef<string | null>(null);
  /** How many turns of the open thread have already been mirrored. */
  const mirroredCountRef = useRef(0);
  const signedIn = !!userId && userId !== 'anon';

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
      const [index, postChats, remote] = await Promise.all([
        readIndex(userId),
        scanPostChats(userId),
        signedIn ? fetchRemoteConversations(userId) : Promise.resolve([]),
      ]);
      // Local wins on a collision: it holds the media URIs and needs no network.
      const localRemoteIds = new Set(
        index.map((e) => e.remoteId).filter(Boolean) as string[],
      );
      const seenIds = new Set(index.map((e) => e.id));
      const merged = [
        ...index,
        ...postChats.filter((p) => !seenIds.has(p.id)),
        ...remote.filter((r) => !localRemoteIds.has(r.remoteId!)),
      ];
      merged.sort((a, b) => b.updatedAt - a.updatedAt);
      if (isMounted.current) setConversations(merged);
    } catch (err) {
      log.error('Failed to load conversations', err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId, signedIn]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setPostContext(undefined);
    remoteIdRef.current = null;
    mirroredCountRef.current = 0;
  }, []);

  /**
   * Put a turn on screen without saving it.
   *
   * Used to re-inject the placeholder for a render that outlived the app: the
   * job is real and already paid for, but a "generating…" stub is not worth a
   * conversation of its own. It gets persisted when the result lands and the
   * turn is patched.
   */
  const appendLocalMessage = useCallback((message: AIChatMessage) => {
    setMessages((prev) =>
      prev.some((m) => m.id && m.id === message.id) ? prev : [...prev, message],
    );
    // Deliberately not counted as mirrored: when the job finishes and the turn
    // is patched, the *finished* version is what gets written to the server.
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
            remoteIdRef.current = null;
            mirroredCountRef.current = msgs.length;
          }
        } catch (err) {
          log.error('Failed to load post chat', err);
        }
        return;
      }

      // A thread that only exists on the server — started on web, or on another
      // device.
      if (entry.remoteOnly && entry.remoteId) {
        const msgs = await fetchRemoteMessages(userId, entry.remoteId);
        setMessages(msgs);
        setPostContext(undefined);
        setConversationId(entry.id);
        remoteIdRef.current = entry.remoteId;
        mirroredCountRef.current = msgs.length;
        return;
      }

      // Standard local conversation
      const data = await readConversation(userId, entry.id);
      if (data) {
        setMessages(data.messages);
        setPostContext(data.postContext);
        setConversationId(entry.id);
        remoteIdRef.current = data.remoteId ?? entry.remoteId ?? null;
        mirroredCountRef.current = data.messages.length;
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

      // Mirror before writing the index, so the entry lands with its remoteId
      // and a later turn does not create a second remote thread.
      const newlyAdded = newMessages.slice(mirroredCountRef.current);
      if (signedIn && newlyAdded.length > 0) {
        if (!remoteIdRef.current) {
          const firstUser = newMessages.find((m) => m.role === 'user');
          remoteIdRef.current = await createRemoteConversation(
            userId,
            firstUser?.content || 'New conversation',
          );
        }
        if (remoteIdRef.current) {
          for (const message of newlyAdded) {
            await appendRemoteMessage(userId, remoteIdRef.current, message);
          }
        }
      }
      // Count them as mirrored either way: a failed upload must not queue the
      // same turn again on the next keystroke.
      mirroredCountRef.current = newMessages.length;

      await writeConversation(userId, cid, {
        messages: newMessages,
        postContext,
        remoteId: remoteIdRef.current ?? undefined,
      });

      const index = await readIndex(userId);
      const existingIdx = index.findIndex((e) => e.id === cid);
      const firstUser = newMessages.find((m) => m.role === 'user');
      const title = firstUser
        ? firstUser.content.slice(0, 60).replace(/\n/g, ' ')
        : 'New conversation';

      if (existingIdx >= 0) {
        index[existingIdx].updatedAt = now;
        index[existingIdx].remoteId = remoteIdRef.current ?? index[existingIdx].remoteId;
        if (newMessages.length <= 2) index[existingIdx].title = title;
      } else {
        index.unshift({
          id: cid!,
          title,
          updatedAt: now,
          remoteId: remoteIdRef.current ?? undefined,
        });
      }

      await writeIndex(userId, index);
      if (isMounted.current) setConversations([...index]);
    },
    [userId, conversationId, postContext, signedIn],
  );

  const deleteConversation = useCallback(
    async (entry: ConversationEntry) => {
      if (!userId) return;

      if (entry.postId) {
        const legacyKey = `${POST_CHAT_PREFIX}${userId.toLowerCase()}_${entry.postId}`;
        await AsyncStorage.removeItem(legacyKey);
      } else if (!entry.remoteOnly) {
        await AsyncStorage.removeItem(DATA_KEY(userId, entry.id));
      }

      // `ai_messages` cascades on the conversation row, so one delete is enough.
      if (entry.remoteId && signedIn) {
        try {
          const { error } = await withWalletHeader(
            supabase.from('ai_conversations').delete().eq('id', entry.remoteId),
            userId,
          );
          if (error) throw error;
        } catch (err) {
          log.error('remote conversation delete failed:', err);
        }
      }

      const index = await readIndex(userId);
      const filtered = index.filter((e) => e.id !== entry.id);
      await writeIndex(userId, filtered);
      if (isMounted.current) {
        setConversations((prev) => prev.filter((e) => e.id !== entry.id));
      }

      if (conversationId === entry.id) {
        startNewConversation();
      }
      refreshConversations();
    },
    [userId, conversationId, startNewConversation, signedIn, refreshConversations],
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

    // Clear the account's server-side history too — otherwise "clear all" wipes
    // the phone and everything reappears from web on the next refresh.
    if (signedIn) {
      try {
        const { error } = await withWalletHeader(
          supabase
            .from('ai_conversations')
            .delete()
            .eq('wallet_address', userId.toLowerCase()),
          userId,
        );
        if (error) throw error;
      } catch (err) {
        log.error('remote clear-all failed:', err);
      }
    }

    if (isMounted.current) {
      setConversations([]);
      startNewConversation();
    }
  }, [userId, startNewConversation, signedIn]);

  return {
    conversationId,
    messages,
    conversations,
    postContext,
    loading,
    startNewConversation,
    appendLocalMessage,
    loadConversation,
    saveMessage,
    deleteConversation,
    clearAll,
    refreshConversations,
  };
}
