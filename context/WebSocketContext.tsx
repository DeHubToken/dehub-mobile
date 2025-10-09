import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import { WebSocketClient } from '../services/ws/socket-client';
import env from '../config/env';
import { AppState } from 'react-native';
import { getAuthToken as readStoredAuthToken } from '../libs/auth.utils';
import { createLogger } from '../libs/logger';

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
  const { user } = useAuth();
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
      }
    });
    return () => { sub.remove(); };
  }, [refreshTokenFromStore]);
  // Stable getters (no deps) that read from ref; the socket will call these at reconnect/build time
  const getAuthToken = useCallback(() => tokenRef.current, []);
  const getAddress = useCallback(() => {
    const u = userRef.current;
    return u ? ((u as any)?.walletAddress || (u as any)?.address || null) : null;
  }, []);
  const clientRef = useRef<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectListenersRef = useRef<Set<() => void>>(new Set());
  // No domain state kept (stream-specific logic removed)

  // Initialize or update auth
  useEffect(() => {
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
        log.info('connected');
        setConnected(true);
        // Notify reconnect listeners
        reconnectListenersRef.current.forEach((fn) => {
          try { fn(); } catch {}
        });
      });
      clientRef.current.on('disconnected', () => { 
        log.info('disconnected');
        setConnected(false);
      });
      // No domain event listeners registered.
    } else {
      clientRef.current.updateAuth();
    }
  }, [getAuthToken, getAddress]);

  // When user changes (token/address), ask client to refresh handshake auth
  useEffect(() => {
    clientRef.current?.updateAuth();
  }, [user]);

  // App foreground resume
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') clientRef.current?.connect();
    });
    return () => { sub.remove(); };
  }, []);

  const emit = useCallback((event: string, payload?: any, ack?: (resp?: any, err?: any) => void) => {
    clientRef.current?.emit(event, payload, ack);
  }, []);
  // Authed emitter: merges current token into payload
  const emitAuthed = useCallback((event: string, payload?: any, ack?: (resp?: any, err?: any) => void) => {
    const token = tokenRef.current;
    // const merged = token ? { ...(payload || {}), token } : payload;
     const merged = { ...(payload || {}) };
     if (ack) {
      clientRef.current?.emit(event, merged, ack);
    } else {
      clientRef.current?.emit(event, merged);
    }
  }, []);
  // Since WebSocketClient.on returns an unsubscribe, we wrap it to also track handlers for a lightweight off.
  // event -> (handler -> unsubscribe)
  const handlerMapRef = useRef<Map<string, Map<Function, Function>>>(new Map());
  const on = useCallback((event: string, handler: (data: any) => void) => {
    const unsubscribe = clientRef.current?.on(event, handler) || (() => {});
    // Track unsubscribe for this handler
    let map = handlerMapRef.current.get(event);
    if (!map) { map = new Map(); handlerMapRef.current.set(event, map); }
    map.set(handler, unsubscribe);
    // Return an unsubscribe that calls the actual underlying unsubscribe and removes tracking
    return () => {
      try { unsubscribe(); } catch {}
      map?.delete(handler);
    };
  }, []);
  const off = useCallback((event: string, handler: (data: any) => void) => {
    const map = handlerMapRef.current.get(event);
    const unsub = map?.get(handler);
    if (unsub) {
      try { unsub(); } catch {}
      map?.delete(handler);
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
