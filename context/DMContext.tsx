import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUser, useAuthState } from "./AuthContext";
import { useWebSocket } from "./WebSocketContext";
import { DMSocketEvent } from "../services/enums/dm-socket-events.enum";
import {
  dmActions,
  hydrateDmFromStorage,
  useDmContacts,
  useDmMessages,
  clearDmStore,
  clearDmStorage,
  setDmCacheKey,
} from "../store/dm.store";
import { getContactsByAddress, getMessages } from "../services/dm/dm.api";
import type {
  DmConversation,
  DmMessage,
  ID,
  EditMessageResponse,
  DeleteMessageResponse,
  ReadReceiptResponse,
  DownloadReceiptResponse,
} from "../services/dm/dm.types";
import { createLogger } from "../libs/logger";

/** Safely extract a plain string ID from either a raw string or a populated Mongoose document. */
function resolveConvId(...vals: unknown[]): string {
  for (const v of vals) {
    if (!v) continue;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && (v as any)._id) return String((v as any)._id);
  }
  return '';
}

export type LoadMessagesOptions = { q?: string; skip?: number; limit?: number };

interface DMContextValue {
  conversations: DmConversation[];
  contactsLoading: boolean;
  contactsError: string | null;
  refreshContacts: () => Promise<void>;
  loadMessages: (conversationId: ID, opts?: LoadMessagesOptions) => Promise<DmMessage[]>;
  useMessages: typeof useDmMessages;
}

const DMContext = createContext<DMContextValue | null>(null);


export const DMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const log = useMemo(() => createLogger("DMProvider"), []);
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const ws = useWebSocket();

  const address = useMemo(
    () => ((user as any)?.walletAddress || (user as any)?.address || "").toLowerCase(),
    [user],
  );
  const userId = ((user as any)?._id || (user as any)?.id) as string | undefined;

  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const socketBoundRef = useRef(false);

  // Refs for stable socket closure access
  const userIdRef = useRef(userId);
  const addressRef = useRef(address);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { addressRef.current = address; }, [address]);


  useEffect(() => {
    if (!isSignedIn || !address) {
      setDmCacheKey(null);
      clearDmStore();
      return;
    }
    setDmCacheKey(address);
    (async () => {
      try {
        clearDmStore();
        await hydrateDmFromStorage(address);
        log.info("hydrate:done", { address: address.slice(0, 8) });
      } catch (e) {
        log.warn("hydrate:error", e);
      }
    })();
  }, [isSignedIn, address, log]);


  useEffect(() => {
    if (socketBoundRef.current) return;
    socketBoundRef.current = true;
    const unsubs: Array<() => void> = [];

    /** Infer author for any incoming message payload. */
    const inferAuthor = (raw: any): "me" | "other" => {
      if (raw?.author === "me" || raw?.author === "other") return raw.author;
      const senderId = String(raw?.sender?._id || raw?.sender || raw?.senderId || "");
      const senderAddr = String(raw?.sender?.address || raw?.address || "").toLowerCase();
      const meId = String(userIdRef.current || "");
      const meAddr = String(addressRef.current || "");
      if ((meId && senderId === meId) || (meAddr && senderAddr === meAddr)) return "me";
      return "other";
    };

    unsubs.push(
      ws.on(DMSocketEvent.SendMessage, (payload: any) => {
        try {
          const cId = resolveConvId(payload?.conversation, payload?.dmId);
          if (!cId) return;
          const author = inferAuthor(payload);
          // Real-time new messages we sent haven't been read by the receiver yet.
          // Server may return isRead:true (sender read their own msg) — override.
          const isRead = author === "me" ? false : payload.isRead;
          dmActions.upsertMessages(cId, [{ ...payload, author, isRead }]);
        } catch (err) {
          log.error("SendMessage handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.CreateAndStart, (resp: any) => {
        try {
          const data = resp?.data || resp;
          if (data) dmActions.upsertContacts([data as DmConversation]);
        } catch (err) {
          log.error("CreateAndStart handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.EditMessage, (payload: EditMessageResponse) => {
        try {
          dmActions.applyEdit(payload);
          log.debug("EditMessage applied", { dmId: payload.dmId, messageId: payload.messageId });
        } catch (err) {
          log.error("EditMessage handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.DeleteMessage, (payload: DeleteMessageResponse) => {
        try {
          dmActions.removeMessage(payload);
          log.debug("DeleteMessage applied", payload);
        } catch (err) {
          log.error("DeleteMessage handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.ForwardMessage, (payload: any) => {
        try {
          const cId = resolveConvId(payload?.conversation, payload?.targetDmId, payload?.dmId);
          if (cId) dmActions.upsertMessages(cId, [{ ...payload, author: inferAuthor(payload) }]);
          log.debug("ForwardMessage", { cId });
        } catch (err) {
          log.error("ForwardMessage handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.readReceipt, (payload: ReadReceiptResponse) => {
        try {
          const meId = userIdRef.current;
          log.info("[TICK_DEBUG] DMContext readReceipt", {
            dmId: payload.dmId,
            readBy: payload.readBy,
            meId,
            isSelf: meId ? String(payload.readBy) === String(meId) : "no-meId",
          });
          if (meId && String(payload.readBy) === String(meId)) return;
          log.info("[TICK_DEBUG] DMContext applying applyReadReceipt (peer read our msgs)");
          dmActions.applyReadReceipt(payload);
        } catch (err) {
          log.error("readReceipt handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.downloadReceipt, (payload: DownloadReceiptResponse) => {
        try {
          dmActions.applyDownloadReceipt(payload);
        } catch (err) {
          log.error("downloadReceipt handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.JobMessageId, (payload: any) => {
        try {
          const raw = payload?.message || payload;
          const cId = resolveConvId(raw?.conversation, payload?.dmId);
          const msgId = String(raw?._id || "");
          if (!cId || !msgId) return;
          dmActions.upsertMessages(cId, [{ ...raw, author: inferAuthor(raw) }]);
        } catch (err) {
          log.error("JobMessageId handler", err);
        }
      }),
    );

    unsubs.push(
      ws.on(DMSocketEvent.DmFeePayment, (p: any) => log.info("DmFeePayment", p)),
    );
    unsubs.push(
      ws.on(DMSocketEvent.TipSend, (p: any) => log.info("TipSend", p)),
    );
    unsubs.push(
      ws.on(DMSocketEvent.TipUpdate, (p: any) => log.info("TipUpdate", p)),
    );

    unsubs.push(ws.on(DMSocketEvent.ReConnect, () => log.info("DM ReConnect")));
    unsubs.push(ws.on(DMSocketEvent.Error, (e: any) => log.warn("DM Error", e)));

    return () => {
      unsubs.forEach((u) => { try { u(); } catch {} });
      socketBoundRef.current = false;
    };
  }, [ws, log]);


  const refreshContacts = useCallback(async () => {
    if (!isSignedIn || !address || fetchingRef.current) return;
    fetchingRef.current = true;
    setContactsLoading(true);
    setContactsError(null);
    try {
      const contacts = await getContactsByAddress(address);
      if (Array.isArray(contacts)) dmActions.upsertContacts(contacts);
      log.info("contacts:fetched", { count: contacts?.length || 0 });
    } catch (e: any) {
      log.error("contacts:error", e);
      setContactsError(e?.message || "Failed to fetch contacts");
    } finally {
      setContactsLoading(false);
      fetchingRef.current = false;
    }
  }, [isSignedIn, address, log]);

  // Auto-refresh
  useEffect(() => {
    if (isSignedIn && address) refreshContacts();
  }, [isSignedIn, address, refreshContacts]);


  const loadMessages = useCallback(
    async (conversationId: ID, opts: LoadMessagesOptions = {}): Promise<DmMessage[]> => {
      if (!isSignedIn || !address) return [];
      try {
        const resp = await getMessages(conversationId, {
          address,
          q: opts.q,
          skip: opts.skip,
          limit: opts.limit,
        });
        const msgs = resp?.messages || [];
        if (msgs.length) {
          const normalized = msgs.map((m: any) => {
            if (m.author === "me" || m.author === "other") return m;
            const senderId = String(m?.sender?._id || m?.sender || "");
            const senderAddr = String(m?.sender?.address || "").toLowerCase();
            const mine =
              (userId && senderId === userId) ||
              (address && senderAddr === address);
            return { ...m, author: mine ? "me" : "other" };
          });
          dmActions.upsertMessages(conversationId, normalized);
          return normalized;
        }
        return [];
      } catch (e: any) {
        log.error("loadMessages:error", e);
        return [];
      }
    },
    [isSignedIn, address, userId, log],
  );


  const conversations = useDmContacts();

  const value = useMemo<DMContextValue>(
    () => ({
      conversations,
      contactsLoading,
      contactsError,
      refreshContacts,
      loadMessages,
      useMessages: useDmMessages,
    }),
    [conversations, contactsLoading, contactsError, refreshContacts, loadMessages],
  );

  return <DMContext.Provider value={value}>{children}</DMContext.Provider>;
};


export function useDMContext(): DMContextValue {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error("useDMContext must be used within DMProvider");
  return ctx;
}

/** @deprecated — use useDMContext() */
export const useDM = useDMContext;
