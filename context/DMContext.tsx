import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useWebSocket } from './WebSocketContext';
import { DMSocketEvent } from '../services/enums/dm-socket-events.enum';
import { dmActions, hydrateDmFromStorage, useDmContacts, useDmMessages, clearDmStore, setDmCacheKey } from '../store/dm.state';
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

// Module-level guards (per app session)
let BOUND_ONCE = false;

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

  // Set active DM cache per-account and hydrate when address changes
  useEffect(() => {
    if (!isSignedIn || !address) {
      setDmCacheKey(null);
      clearDmStore().catch(() => {}); // clear in-memory on logout
      return;
    }
    // Switch to per-account cache key and hydrate
    setDmCacheKey(address);
    (async () => {
      await clearDmStore(); // ensure clean memory before hydrating this account
      await hydrateDmFromStorage(address);
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
          const meId = String(userId || '');
          const meAddr = String(address || '');
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
    if (!isSignedIn || !address || fetchingRef.current) return;
    fetchingRef.current = true;
    setContactsLoading(true);
    setContactsError(null);
    try {
      const contacts = await getContactsByAddress(address);
      if (!Array.isArray(contacts)) return;
      dmActions.upsertContacts(contacts as any);
    } catch (e: any) {
      setContactsError(e?.message || 'Failed to fetch contacts');
    } finally {
      setContactsLoading(false);
      fetchingRef.current = false;
    }
  }, [isSignedIn, address]);

  // Auto-refresh when signed in
  useEffect(() => {
    if (!isSignedIn || !address) return;
    refreshContacts();
  }, [isSignedIn, address, refreshContacts]);

  // Auto-refresh contacts when signed in (kept separate)

  const loadMessages = useCallback(async (conversationId: ID, opts: LoadMessagesOptions = {}) => {
    if (!isSignedIn || !address) return [] as any[];
    const resp = await getMessagesDm(conversationId, { address, q: opts.q, skip: opts.skip, limit: opts.limit });
    const arr = Array.isArray(resp?.messages) ? resp.messages : [];
    if (arr.length) dmActions.upsertMessages(conversationId, arr as any);
    return arr as any[];
  }, [isSignedIn, address]);

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
