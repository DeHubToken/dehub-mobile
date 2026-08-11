import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useUser } from './AuthContext';
import { WebSocketClient } from '../services/ws/socket-client';
import env from '../config/env';
import { AppState } from 'react-native';
import { getAuthToken as readStoredAuthToken } from '../libs/auth.utils';
import { tokenRefreshManager } from '../libs/token-refresh';
import { createLogger } from '../libs/logger';
import { DMSocketEvent, DMSocketEventSet } from '../services/enums/dm-socket-events.enum';

interface WebSocketContextValue {
  connected: boolean;
  emit: (event: string, payload?: any, ack?: (resp?: any, err?: any) => void) => void;
  emitAuthed: (event: string, payload?: any, ack?: (resp?: any, err?: any) => void) => void;
  on: (event: string, handler: (data: any) => void) => () => void;
  off: (event: string, handler: (data: any) => void) => void;
  /** Direct access to the underlying client for advanced use-cases (avoid in generic UI code) */
  client?: WebSocketClient | null;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const log = useMemo(() => createLogger('WebSocketContext'), []);
  const user = useUser();
  // Keep latest user in a ref so getters always read current values
  const userRef = useRef<any>(user);
  useEffect(() => { userRef.current = user; }, [user]);
  // Keep latest token from SecureStore
  const tokenRef = useRef<string | null>(null);
  const refreshTokenFromStore = useCallback(async () => {
    try {
      const tk = await readStoredAuthToken();
      tokenRef.current = tk || null;
    } catch {
      tokenRef.current = null;
    }
  }, []);
  // Load token initially and whenever user changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshTokenFromStore();
      if (!cancelled) clientRef.current?.updateAuth();
    })();
    return () => { cancelled = true; };
  }, [user, refreshTokenFromStore]);
  // Also refresh token on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (s) => {
      if (s === 'active') {
        await refreshTokenFromStore();
        clientRef.current?.updateAuth();
        dmClientRef.current?.updateAuth();
      }
    });
    return () => { sub.remove(); };
  }, [refreshTokenFromStore]);
  // Subscribe to token refresh events for immediate WebSocket auth update
  useEffect(() => {
    const unsubscribe = tokenRefreshManager.onTokenRefreshed(async () => {
      await refreshTokenFromStore();
      clientRef.current?.updateAuth();
      dmClientRef.current?.updateAuth();
    });
    return unsubscribe;
  }, [refreshTokenFromStore]);
  // Stable getters (no deps) that read from ref; the socket will call these at reconnect/build time
  const getAuthToken = useCallback(() => tokenRef.current, []);
  const getAddress = useCallback(() => {
    const u = userRef.current;
    return u ? ((u as any)?.walletAddress || (u as any)?.address || null) : null;
  }, []);
  const clientRef = useRef<WebSocketClient | null>(null);
  const dmClientRef = useRef<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const connectedCoreRef = useRef<boolean>(false);
  const connectedDMRef = useRef<boolean>(false);
  const reconnectListenersRef = useRef<Set<() => void>>(new Set());
  // No domain state kept (stream-specific logic removed)

  // ── Subscriptions ─────────────────────────────────────────────────────────
  //
  // Held here rather than handed straight to a client, because the clients no
  // longer exist for the whole life of the provider (see the gate below). A
  // handler registered while signed out would otherwise be dropped on the floor
  // and never re-attach once the sockets came up.
  type Sub = { event: string; handler: (data: any) => void; detach?: () => void };
  const subsRef = useRef<Set<Sub>>(new Set());

  const isDmEvent = useCallback((event: string) => DMSocketEventSet.has(event), []);

  /** Bind one subscription to its namespace. No-op while that client is absent. */
  const attachSub = useCallback((sub: Sub) => {
    const target = isDmEvent(sub.event) ? dmClientRef.current : clientRef.current;
    if (!target) return;
    sub.detach = target.on(sub.event, sub.handler);
  }, [isDmEvent]);

  /** Bind everything that is still waiting for a client. */
  const attachPendingSubs = useCallback(() => {
    subsRef.current.forEach((sub) => {
      if (!sub.detach) attachSub(sub);
    });
  }, [attachSub]);

  // Initialize or update auth.
  //
  // Gated on having a wallet address. Both sockets used to be constructed with
  // autoConnect on the provider's first render, which is unconditional and sits
  // above the whole app — so a signed-out visitor opened two socket.io
  // connections during boot, competing with the feed's own first requests, and
  // then sat in socket.io's reconnect loop against a server with nothing to say
  // to an unauthenticated client. Nothing this app does over either socket
  // (DMs, calls, live chat, notifications) means anything without an account.
  const hasIdentity = !!getAddress();

  useEffect(() => {
    if (!hasIdentity) return;
    if (!clientRef.current) {
      const baseRaw = env?.WEBSOCKET_URL || 'https://api.dehub.io';
      // Ensure base URL does not already include the socket.io path
      const base = (baseRaw || '').replace(/\/socket\.io\/?$/i, '');
      const url = base.replace(/\/$/, '');
      log.debug('init with URL:', url);
      clientRef.current = new WebSocketClient({
        url,
        getAuthToken,
        getAddress,
        autoConnect: true,
        debug: !!env.DEBUG,
      });
      clientRef.current.on('connect_error', (err: any) => {
        log.warn('connect_error', { url, message: err?.message, stack: err?.stack });
      });
      clientRef.current.on('connected', () => { 
        log.info('connected (core namespace)');
        connectedCoreRef.current = true;
        setConnected(true);
        // Notify reconnect listeners
        reconnectListenersRef.current.forEach((fn) => {
          try { fn(); } catch {}
        });
      });
      clientRef.current.on('disconnected', () => { 
        log.info('disconnected (core namespace)');
        connectedCoreRef.current = false;
        setConnected(connectedDMRef.current);
      });
      // No domain event listeners registered.

      // Initialize DM namespace socket
      const dmUrl = `${url}/dm`;
      log.debug('init DM namespace with URL:', dmUrl);
      dmClientRef.current = new WebSocketClient({
        url: dmUrl,
        getAuthToken,
        getAddress,
        autoConnect: true,
        debug: !!env.DEBUG,
      });
      dmClientRef.current.on('connect_error', (err: any) => {
        log.warn('dm connect_error', { url: dmUrl, message: err?.message, stack: err?.stack });
      });
      dmClientRef.current.on('connected', () => {
        log.info('connected (dm namespace)');
        connectedDMRef.current = true;
        setConnected(true);
        reconnectListenersRef.current.forEach((fn) => {
          try { fn(); } catch {}
        });
      });
      dmClientRef.current.on('disconnected', () => {
        log.info('disconnected (dm namespace)');
        connectedDMRef.current = false;
        setConnected(connectedCoreRef.current);
      });
      // Anything that subscribed before sign-in is bound now.
      attachPendingSubs();
    } else {
      clientRef.current.updateAuth();
      dmClientRef.current?.updateAuth();
    }
  }, [hasIdentity, getAuthToken, getAddress, attachPendingSubs]);

  // When user changes (token/address), ask client to refresh handshake auth
  useEffect(() => {
    clientRef.current?.updateAuth();
    dmClientRef.current?.updateAuth();
  }, [user]);

  // Track background timestamp for smart reconnection
  const backgroundTimestampRef = useRef<number | null>(null);
  
  // App foreground resume with smart reconnection
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') {
        backgroundTimestampRef.current = Date.now();
      } else if (s === 'active') {
        const bgTime = backgroundTimestampRef.current;
        const wasLongBackground = bgTime && (Date.now() - bgTime) > 30000; // 30 seconds
        
        // If app was in background for a long time, delay reconnection slightly
        // to let other initialization complete first
        const delay = wasLongBackground ? 500 : 0;
        
        setTimeout(() => {
          try {
            clientRef.current?.connect();
            dmClientRef.current?.connect();
          } catch (error) {
            log.error('Failed to reconnect WebSocket on foreground', error);
          }
        }, delay);
        
        backgroundTimestampRef.current = null;
      }
    });
    return () => { sub.remove(); };
  }, [log]);

  const emit = useCallback((event: string, payload?: any, ack?: (resp?: any, err?: any) => void) => {
    const target = isDmEvent(event) ? dmClientRef.current : clientRef.current;
    target?.emit(event, payload, ack);
  }, [isDmEvent]);

  /**
   * Kept as a distinct name because eight DM call sites use it, but it no
   * longer differs from `emit`: the token merge it is named for was commented
   * out and the socket authenticates on the handshake instead. Left as an alias
   * rather than a copy so the two cannot drift.
   */
  const emitAuthed = emit;

  const on = useCallback((event: string, handler: (data: any) => void) => {
    // Routed by namespace, exactly like emit(). This used to subscribe the same
    // handler to BOTH sockets unconditionally, so any event name the two
    // namespaces share delivered twice — one action, two handler calls, which
    // is what a message appearing twice in a thread looks like.
    const sub: Sub = { event, handler };
    subsRef.current.add(sub);
    attachSub(sub);
    return () => {
      try { sub.detach?.(); } catch {}
      subsRef.current.delete(sub);
    };
  }, [attachSub]);

  const off = useCallback((event: string, handler: (data: any) => void) => {
    for (const sub of subsRef.current) {
      if (sub.event !== event || sub.handler !== handler) continue;
      try { sub.detach?.(); } catch {}
      subsRef.current.delete(sub);
    }
  }, []);
  const value = useMemo(() => ({ connected, emit, emitAuthed, on, off, client: clientRef.current }), [connected, emit, emitAuthed, on, off]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocket = (): WebSocketContextValue => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
};
