import { io, Socket } from "socket.io-client";
import { GenericHandler } from "./events";

export interface WebSocketClientOptions {
  url: string;
  getAuthToken: () => string | null;
  autoConnect?: boolean;
  heartbeatIntervalMs?: number;
  maxBackoffMs?: number;
  baseBackoffMs?: number;
  debug?: boolean;
}

type ListenerMap = Map<string, Set<GenericHandler>>;

export class WebSocketClient {
  private socket: Socket | null = null;
  private opts: Required<WebSocketClientOptions>;
  private connecting = false;
  private reconnectAttempts = 0;
  private heartbeatTimer: any = null;
  private queuedEmits: Array<{ event: string; payload?: any; ack?: Function }> = [];
  private listeners: ListenerMap = new Map();
  private destroyed = false;
  private lastAuthToken: string | null = null;

  constructor(opts: WebSocketClientOptions) {
    this.opts = {
      autoConnect: true,
      heartbeatIntervalMs: 25000,
      maxBackoffMs: 30000,
      baseBackoffMs: 800,
      debug: false,
      ...opts,
    };
    if (this.opts.autoConnect) this.connect();
  }

  private log(...args: any[]) { if (this.opts.debug) console.log('[WS]', ...args); }

  private buildSocket() {
    const token = this.opts.getAuthToken();
    this.lastAuthToken = token;
    this.socket = io(this.opts.url, {
      transports: ['websocket'],
      autoConnect: false,
      forceNew: true,
      reconnection: false, // manual backoff
      auth: token ? { token } : undefined,
      path: '/socket.io',
    });

    this.socket.on('connect', () => {
      this.log('connected', this.socket?.id);
      this.reconnectAttempts = 0;
      this.flushQueue();
      this.startHeartbeat();
      this.emitInternal('connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.log('disconnect', reason);
      this.stopHeartbeat();
      if (!this.destroyed) this.scheduleReconnect();
      this.emitInternal('disconnected');
    });

    this.socket.on('connect_error', (err: any) => {
      this.log('connect_error', err?.message);
      this.stopHeartbeat();
      if (err?.message?.toLowerCase().includes('unauthorized')) {
        this.log('auth failed, retrying without token');
        this.lastAuthToken = null;
      }
      if (!this.destroyed) this.scheduleReconnect();
      this.emitInternal('connect_error', err);
    });

    // No domain events wired (stream features removed)
  }

  connect() {
    if (this.destroyed || this.connecting) return;
    if (this.socket && this.socket.connected) return;
    if (!this.socket) this.buildSocket();

    this.connecting = true;
    try { this.socket?.connect(); } catch { this.connecting = false; this.scheduleReconnect(); }
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectAttempts += 1;
    const exp = this.opts.baseBackoffMs * Math.pow(2, Math.min(this.reconnectAttempts, 6));
    const delay = Math.min(exp, this.opts.maxBackoffMs);
    this.log('reconnect in', delay);
    setTimeout(() => {
      if (this.destroyed) return;
      const current = this.opts.getAuthToken();
      const tokenChanged = current !== this.lastAuthToken;
      if (tokenChanged) { this.log('token changed, rebuild socket'); this.destroySocketOnly(); this.buildSocket(); }
      this.connecting = false;
      this.connect();
    }, delay);
  }

  private destroySocketOnly() {
    try { this.socket?.removeAllListeners(); this.socket?.disconnect(); } catch {}
    this.socket = null;
  }

  disconnect() { this.destroyed = true; this.stopHeartbeat(); this.destroySocketOnly(); }

  private startHeartbeat() { this.stopHeartbeat(); this.heartbeatTimer = setInterval(() => { if (this.socket?.connected) this.socket.emit('ping', { t: Date.now() }); }, this.opts.heartbeatIntervalMs); }
  private stopHeartbeat() { if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; } }

  updateAuth() {
    if (this.destroyed) return;
    const newToken = this.opts.getAuthToken();
    if (newToken === this.lastAuthToken) return;
    this.log('auth updated, reconnecting');
    this.lastAuthToken = newToken;
    this.destroySocketOnly();
    this.buildSocket();
    this.connect();
  }

  emit<T = any>(event: string, payload?: T, ack?: (resp?: any, err?: any) => void) {
    if (!this.socket || !this.socket.connected) { this.queuedEmits.push({ event, payload, ack }); return; }
    this.socket.emit(event, payload, ack);
  }

  private flushQueue() { if (!this.socket?.connected) return; while (this.queuedEmits.length) { const item = this.queuedEmits.shift(); if (!item) break; this.socket.emit(item.event, item.payload, item.ack); } }

  private emitInternal(event: string, data?: any) { const set = this.listeners.get(event); if (!set) return; set.forEach(cb => { try { cb(data); } catch (e) { this.log('listener error', e); } }); }

  on<T = any>(event: string, handler: GenericHandler<T>) { let set = this.listeners.get(event); if (!set) { set = new Set(); this.listeners.set(event, set); } set.add(handler as GenericHandler); return () => { set?.delete(handler as GenericHandler); }; }

  // Stream-related methods removed.
}
