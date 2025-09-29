import React, { createContext, useContext, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import { WebSocketClient } from '../services/ws/socket-client';
import env from '../config/env';
import { AppState } from 'react-native';

interface WebSocketContextValue {
  connected: boolean;
  emit: (event: string, payload?: any, ack?: (resp?: any, err?: any) => void) => void;
  on: (event: string, handler: (data: any) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  // We don't store token in context currently; reopen using persisted token when signed in.
  const getAuthToken = useCallback(() => (user ? (user as any)?.token || null : null), [user]);
  const clientRef = useRef<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  // No domain state kept (stream-specific logic removed)

  // Initialize or update auth
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = new WebSocketClient({
        url: env?.WEBSOCKET_URL?.replace(/\/$/, '') || 'https://api.dehub.io',
        getAuthToken,
        autoConnect: true,
        debug: false,
      });
      clientRef.current.on('connected', () => setConnected(true));
      clientRef.current.on('disconnected', () => setConnected(false));
      // No domain event listeners registered.
    } else {
      clientRef.current.updateAuth();
    }
  }, [getAuthToken]);

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
  const on = useCallback((event: string, handler: (data: any) => void) => {
    return clientRef.current?.on(event, handler) || (() => {});
  }, []);

  const value = useMemo(() => ({ connected, emit, on }), [connected, emit, on]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocket = (): WebSocketContextValue => {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
};
