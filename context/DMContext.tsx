import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useWebSocket } from './WebSocketContext';
import { DMSocketEvent } from '../services/enums/dm-socket-events.enum';
import { dmActions, hydrateDmFromStorage, useDmContacts, useDmMessages, clearDmStore, setDmCacheKey } from '../store/dm.state';
import { setMsgCacheKey } from '../store/messages.state';
import { setViewAccount } from '../services/view.service';
import type { ID } from '../store/dm.state';
import { getContactsByAddress, getMessagesDm } from '../services/dm/dm.service';
import { createLogger } from '../libs/logger';

export type LoadMessagesOptions = { q?: string; skip?: number; limit?: number };

type DMContextValue = {
  conversations: ReturnType<typeof useDmContacts>;
  contactsLoading: boolean;
  contactsError: string | null;
  refreshContacts: () => Promise<void>;
  loadMessages: (conversationId: ID, opts?: LoadMessagesOptions) => Promise<any[]>;
  useMessages: typeof useDmMessages;
};

const DMContext = createContext<DMContextValue | null>(null);

export const DMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const log = useMemo(() => createLogger('DMProvider'), []);
  const { isSignedIn, user } = useAuth();
  const ws = useWebSocket();
  const address = useMemo(() => (user?.walletAddress || user?.address || '').toLowerCase(), [user?.walletAddress, user?.address]);
  const userId = user?.id;

  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const socketBoundRef = useRef(false);
  // Refs for stable access in socket closures (avoid stale closures on sign-in/out)
  const userIdRef = useRef(userId);
  const addressRef = useRef(address);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { addressRef.current = address; }, [address]);

  // Set active DM cache per-account and hydrate when address changes
  useEffect(() => {
    if (!isSignedIn || !address) {
      setDmCacheKey(null);
      setMsgCacheKey(null);
      setViewAccount(null);
      const t0 = Date.now();
      log.info('boot:address:none:clear:start');
      clearDmStore()
        .then(() => {
          const ms = Date.now() - t0;
          log.info('boot:address:none:clear:done', { ms });
        })
        .catch((e) => log.warn('boot:address:none:clear:error', e));
      return;
    }
    // Switch to per-account cache key and hydrate
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    log.info('boot:address:setCacheKey', { address: short });
    setDmCacheKey(address);
    setMsgCacheKey(address);
    setViewAccount(address);
    (async () => {
      const t0 = Date.now();
      // ensure clean memory before hydrating this account
      const tClear = Date.now();
      try {
        await clearDmStore();
        log.info('hydrate:clear:done', { ms: Date.now() - tClear, sinceStart: Date.now() - t0 });
      } catch (e) {
        log.warn('hydrate:clear:error', e);
      }
      const tHydrate = Date.now();
      try {
        await hydrateDmFromStorage(address);
        log.info('hydrate:storage:done', { ms: Date.now() - tHydrate, sinceStart: Date.now() - t0 });
      } catch (e) {
        log.warn('hydrate:storage:error', e);
      }
      log.info('hydrate:total:done', { totalMs: Date.now() - t0 });
    })();
  }, [isSignedIn, address]);

  // Bind DM socket listeners once while provider is mounted
  useEffect(() => {
    if (socketBoundRef.current) return;
    socketBoundRef.current = true;
    const unsubs: Array<() => void> = [];

    // Incoming message: prefer backend author, else infer via id/address
    unsubs.push(ws.on(DMSocketEvent.SendMessage, (payload: any) => {
      try {
        const cId = String(payload?.conversation || '');
        if (!cId) return;
        const providedAuthor = (payload?.author === 'me' || payload?.author === 'other') ? payload.author : undefined;
        let author: 'me' | 'other' | undefined = providedAuthor;
        if (!author) {
          const senderId = String(payload?.sender?._id || payload?.sender || payload?.senderId || '');
          const senderAddr = String(payload?.sender?.address || payload?.address || payload?.senderAddress || '').toLowerCase();
          const meId = String(userIdRef.current || '');
          const meAddr = String(addressRef.current || '');
          const isMine = (!!meId && senderId === meId) || (!!meAddr && senderAddr === meAddr);
          author = isMine ? 'me' : 'other';
        }
        const normalized = { ...payload, author };
        dmActions.upsertMessages(cId, [normalized]);
        log.debug('SendMessage -> upserted', { conversation: cId, msgId: String(payload?._id || ''), author: normalized.author });
      } catch (err) {
        log.error('SendMessage handler error', err);
      }
    }));

    // Conversation created/returned
    unsubs.push(ws.on(DMSocketEvent.CreateAndStart, (resp: any) => {
      try {
        const data = resp?.data || resp;
        if (!data) return;
        dmActions.upsertContacts([{ ...(data as any) }]);
        log.info('CreateAndStart -> upserted contact', { id: String(data?._id || data?.id || '') });
      } catch (err) {
        log.error('CreateAndStart handler error', err);
      }
    }));

    // Optional events (log for observability)
    unsubs.push(ws.on(DMSocketEvent.DeleteMessage, (payload: any) => log.warn('DeleteMessage (not handled)', payload)));
    unsubs.push(ws.on(DMSocketEvent.TipUpdate, (payload: any) => log.info('TipUpdate', payload)));
    unsubs.push(ws.on(DMSocketEvent.FetchMessage, (payload: any) => log.debug('FetchMessage', payload)));
    unsubs.push(ws.on(DMSocketEvent.ReValidateMessage, (payload: any) => log.debug('ReValidateMessage', payload)));
    // Upload progress/completion: server emits jobMessageId with message payload updates
    unsubs.push(ws.on(DMSocketEvent.JobMessageId, (payload: any) => {
      try {
        // Handle both shapes:
        // 1) { _id, conversation, ... }
        // 2) { dmId, message: { _id, conversation, ... }, status }
        const raw = payload?.message || payload;
        const msgId = String(raw?._id || '');
        const cId = String(raw?.conversation || payload?.dmId || '');
        if (!cId || !msgId) {
          log.debug('jobMessageId: missing ids', payload);
          return;
        }
        // Normalize author like SendMessage handler
        const providedAuthor = (raw?.author === 'me' || raw?.author === 'other') ? raw.author : undefined;
        let author: 'me' | 'other' | undefined = providedAuthor;
        if (!author) {
          const senderId = String(raw?.sender?._id || raw?.sender || raw?.senderId || '');
          const senderAddr = String(raw?.sender?.address || raw?.address || raw?.senderAddress || '').toLowerCase();
          const meId = String(userIdRef.current || '');
          const meAddr = String(addressRef.current || '');
          const isMine = (!!meId && senderId === meId) || (!!meAddr && senderAddr === meAddr);
          author = isMine ? 'me' : 'other';
        }
        const normalized = { ...raw, author };
        dmActions.upsertMessages(cId, [normalized as any]);
        log.debug('jobMessageId -> upserted', { conversation: cId, msgId, author: normalized.author });
      } catch (err) {
        log.error('jobMessageId handler error', err);
      }
    }));
    // Download receipt: server confirms/propagates isDownloaded change
    unsubs.push(ws.on(DMSocketEvent.downloadReceipt, (payload: any) => {
      try {
        const dmId = String(payload?.dmId || '');
        const messageId = String(payload?.messageId || '');
        if (!dmId || !messageId) return;
        dmActions.upsertMessages(dmId, [{ _id: messageId, isDownloaded: true } as any]);
        log.debug('downloadReceipt -> marked isDownloaded', { dmId, messageId });
      } catch (err) {
        log.error('downloadReceipt handler error', err);
      }
    }));

    unsubs.push(ws.on(DMSocketEvent.ReConnect, () => log.info('DM ReConnect')));
    unsubs.push(ws.on(DMSocketEvent.Ping, () => log.debug('DM ping')));
    unsubs.push(ws.on(DMSocketEvent.Pong, () => log.debug('DM pong')));
    unsubs.push(ws.on(DMSocketEvent.Error, (err: any) => log.warn('DM error', err)));

    // Keep listeners for provider lifetime (app-wide updates)
    return () => {
      unsubs.forEach((u) => { try { u(); } catch {} });
      socketBoundRef.current = false;
    };
  }, [ws, log, userId, address]);

  const refreshContacts = useCallback(async () => {
    if (!isSignedIn) {
      log.debug('contacts:fetch:skip', { reason: 'not-signed-in' });
      return;
    }
    if (!address) {
      log.debug('contacts:fetch:skip', { reason: 'no-address' });
      return;
    }
    if (fetchingRef.current) {
      log.debug('contacts:fetch:skip', { reason: 'in-flight' });
      return;
    }
    fetchingRef.current = true;
    setContactsLoading(true);
    setContactsError(null);
    const t0 = Date.now();
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    log.info('contacts:fetch:start', { address: short });
    try {
      const contacts = await getContactsByAddress(address);
      const count = Array.isArray(contacts) ? contacts.length : 0;
      // console.log({contacts, texts: contacts.map(c => c.messages.map(m => m.content).join('\n'))})
      if (Array.isArray(contacts)) dmActions.upsertContacts(contacts as any);
      const withMessages = Array.isArray(contacts)
        ? contacts.filter((c: any) => Array.isArray(c?.messages) && c.messages.length > 0).length
        : 0;
      log.info('contacts:fetch:done', {
        count,
        withMessages,
        ms: Date.now() - t0,
      });
    } catch (e: any) {
      log.error('contacts:fetch:error', { ms: Date.now() - t0, message: e?.message || String(e) });
      setContactsError(e?.message || 'Failed to fetch contacts');
    } finally {
      setContactsLoading(false);
      fetchingRef.current = false;
    }
  }, [isSignedIn, address]);

  // Auto-refresh when signed in
  useEffect(() => {
    if (!isSignedIn || !address) {
      log.debug('contacts:auto:skip', { isSignedIn, hasAddress: !!address });
      return;
    }
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    log.info('contacts:auto:trigger', { address: short });
    refreshContacts();
  }, [isSignedIn, address, refreshContacts]);

  // Auto-refresh contacts when signed in (kept separate)

  const loadMessages = useCallback(async (conversationId: ID, opts: LoadMessagesOptions = {}) => {
    if (!isSignedIn) {
      log.debug('messages:fetch:skip', { conversationId: String(conversationId), reason: 'not-signed-in' });
      return [] as any[];
    }
    if (!address) {
      log.debug('messages:fetch:skip', { conversationId: String(conversationId), reason: 'no-address' });
      return [] as any[];
    }
    const t0 = Date.now();
    const meta: any = { conversationId: String(conversationId) };
    if (opts?.q) meta.q = String(opts.q);
    if (typeof opts?.skip === 'number') meta.skip = opts.skip;
    if (typeof opts?.limit === 'number') meta.limit = opts.limit;
    log.info('messages:fetch:start', meta);
    try {
      const resp = await getMessagesDm(conversationId, { address, q: opts.q, skip: opts.skip, limit: opts.limit });
      const arrRaw = Array.isArray(resp?.messages) ? resp.messages : [];
      const normalized = arrRaw.map((raw: any) => {
        const providedAuthor = raw?.author === 'me' || raw?.author === 'other' ? raw.author : undefined;
        if (providedAuthor) return raw;
        const senderId = String(raw?.sender?._id || raw?.sender || raw?.senderId || '');
        const senderAddr = String(raw?.sender?.address || raw?.address || raw?.senderAddress || '').toLowerCase();
        const meId = String(userId || '');
        const meAddr = String(address || '');
        const isMine = (!!meId && senderId === meId) || (!!meAddr && senderAddr === meAddr);
        return { ...raw, author: isMine ? 'me' : 'other' };
      });
      const count = normalized.length;
      if (count) dmActions.upsertMessages(conversationId, normalized as any);
      log.info('messages:fetch:done', { conversationId: String(conversationId), count, ms: Date.now() - t0 });
      return normalized as any[];
    } catch (e: any) {
      log.error('messages:fetch:error', { conversationId: String(conversationId), ms: Date.now() - t0, message: e?.message || String(e) });
      return [] as any[];
    }
  }, [isSignedIn, address, userId]);

  const conversations = useDmContacts();

  const value = useMemo<DMContextValue>(() => ({
    conversations,
    contactsLoading,
    contactsError,
    refreshContacts,
    loadMessages,
    useMessages: useDmMessages,
  }), [conversations, contactsLoading, contactsError, refreshContacts, loadMessages]);

  return (
    <DMContext.Provider value={value}>
      {children}
    </DMContext.Provider>
  );
};

export function useDMContext(): DMContextValue {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error('useDMContext must be used within DMProvider');
  return ctx;
}
