import { io, Socket } from "socket.io-client";
import { GenericHandler } from "./events";

export interface WebSocketClientOptions {
  url: string;
  getAuthToken: () => string | null;
  getAddress?: () => string | null;
  autoConnect?: boolean;
  heartbeatIntervalMs?: number;
  maxBackoffMs?: number;
  baseBackoffMs?: number;
  debug?: boolean;
}

type ListenerMap = Map<string, Set<GenericHandler>>;

export class WebSocketClient {
  private socket: Socket | null = null;
  private opts: Omit<Required<WebSocketClientOptions>, "getAddress"> & {
    getAddress: () => string | null;
  };
  private connecting = false;
  private reconnectAttempts = 0;
  private heartbeatTimer: any = null;
  private connectionCheckTimeout: any = null;
  private queuedEmits: Array<{ event: string; payload?: any; ack?: Function }> =
    [];
  private listeners: ListenerMap = new Map();
  private destroyed = false;
  private lastAuthToken: string | null = null;
  private lastAddress: string | null = null;

  constructor(opts: WebSocketClientOptions) {
    this.opts = {
      autoConnect: true,
      heartbeatIntervalMs: 25000,
      maxBackoffMs: 30000,
      baseBackoffMs: 800,
      debug: false,
      getAddress: () => null,
      ...opts,
    };
    if (this.opts.autoConnect) this.connect();
  }

  private log(...args: any[]) {
    if (this.opts.debug) console.log("[WS]", ...args);
  }

  private buildSocket() {
    const token = this.opts.getAuthToken();
    const address = this.opts.getAddress ? this.opts.getAddress() : null;
    // this.log({token, address})
    this.lastAuthToken = token;
    this.lastAddress = address;
    const handshakeAuth: any = {};
    if (token) handshakeAuth.token = token;
    if (address) handshakeAuth.address = address;
    // this.log({ handshakeAuth });
    this.socket = io(this.opts.url, {
      // Prefer polling first to avoid strict WS proxies, then upgrade to WS when possible
      transports: ["polling", "websocket"],
      upgrade: true,
      withCredentials: true,
      autoConnect: false,
      forceNew: true,
      reconnection: false, // manual backoff
      auth: handshakeAuth,
      query: handshakeAuth,
      path: "/socket.io/",
      transportOptions: {
        polling: {
          withCredentials: true,
        },
      } as any,
    });

    this.socket.on("connect", () => {
      this.log("connected", this.socket?.id);
      this.reconnectAttempts = 0;
      this.flushQueue();
      this.startHeartbeat();
      if (this.connectionCheckTimeout) {
        clearTimeout(this.connectionCheckTimeout);
        this.connectionCheckTimeout = null;
      }
      this.emitInternal("connected");
    });

    this.socket.on("disconnect", (reason) => {
      this.log("disconnect", reason);
      this.stopHeartbeat();
      if (this.connectionCheckTimeout) {
        clearTimeout(this.connectionCheckTimeout);
        this.connectionCheckTimeout = null;
      }
      if (!this.destroyed) this.scheduleReconnect();
      this.emitInternal("disconnected");
    });

    this.socket.on("connect_error", (err: any) => {
      this.log("connect_error", err?.message);
      this.stopHeartbeat();
      if (err?.message?.toLowerCase().includes("unauthorized")) {
        this.log("auth failed, retrying without token");
        this.lastAuthToken = null;
      }
      // Try a quick fallback to polling-only on immediate transport errors
      try {
        const ioMgr = (this.socket as any)?.io;
        if (
          ioMgr &&
          Array.isArray(ioMgr.opts?.transports) &&
          ioMgr.opts.transports.length > 1
        ) {
          this.log("falling back to polling transport due to connect_error");
          ioMgr.opts.transports = ["polling"];
        }
      } catch {}
      if (!this.destroyed) this.scheduleReconnect();
      this.emitInternal("connect_error", err);
    });

    // No domain events wired (stream features removed)

    // Engine-level diagnostics
    // @ts-ignore
    const engine = (this.socket as any)?.io?.engine;
    if (engine) {
      engine.on("upgrade", (t: any) => {
        this.log("engine upgraded transport ->", t?.name);
      });
      engine.on("close", (reason: any) => {
        this.log("engine closed", reason);
      });
      engine.on("error", (e: any) => {
        this.log("engine error", e?.message || e);
      });
    }
  }

  connect() {
    if (this.destroyed || this.connecting) return;
    if (this.socket && this.socket.connected) return;
    if (!this.socket) this.buildSocket();

    this.connecting = true;
    try {
      // Set up a short connection timeout; if still not connected, attempt polling-only
      if (this.connectionCheckTimeout) {
        clearTimeout(this.connectionCheckTimeout);
        this.connectionCheckTimeout = null;
      }
      this.connectionCheckTimeout = setTimeout(() => {
        if (this.socket && !this.socket.connected) {
          try {
            const ioMgr = (this.socket as any)?.io;
            if (ioMgr) {
              this.log(
                "connection timeout; switching to polling-only and reconnecting"
              );
              ioMgr.opts.transports = ["polling"];
              // restart connection attempt
              try {
                this.socket?.connect();
              } catch {}
            }
          } catch {}
        }
      }, 5000);
      this.socket?.connect();
    } catch {
      this.connecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectAttempts += 1;
    const exp =
      this.opts.baseBackoffMs *
      Math.pow(2, Math.min(this.reconnectAttempts, 6));
    const delay = Math.min(exp, this.opts.maxBackoffMs);
    this.log("reconnect in", delay);
    setTimeout(() => {
      if (this.destroyed) return;
      const current = this.opts.getAuthToken();
      const addressNow = this.opts.getAddress ? this.opts.getAddress() : null;
      const tokenChanged = current !== this.lastAuthToken;
      const addressChanged = addressNow !== this.lastAddress;
      if (tokenChanged || addressChanged) {
        this.log("token changed, rebuild socket");
        this.destroySocketOnly();
        this.buildSocket();
      }
      this.connecting = false;
      this.connect();
    }, delay);
  }

  private destroySocketOnly() {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } catch {}
    if (this.connectionCheckTimeout) {
      clearTimeout(this.connectionCheckTimeout);
      this.connectionCheckTimeout = null;
    }
    this.socket = null;
  }

  disconnect() {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.connectionCheckTimeout) {
      clearTimeout(this.connectionCheckTimeout);
      this.connectionCheckTimeout = null;
    }
    this.destroySocketOnly();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Match frontend: emit 'heartbeat' every ~10s by default; respect configured interval
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) this.socket.emit("heartbeat");
    }, Math.max(10000, this.opts.heartbeatIntervalMs));
  }
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  updateAuth() {
    if (this.destroyed) return;
    const newToken = this.opts.getAuthToken();
    const newAddress = this.opts.getAddress ? this.opts.getAddress() : null;
    if (newToken === this.lastAuthToken && newAddress === this.lastAddress)
      return;
    this.log("auth/address updated, reconnecting");
    this.lastAuthToken = newToken;
    this.lastAddress = newAddress;
    this.destroySocketOnly();
    this.buildSocket();
    this.connect();
  }

  emit<T = any>(
    event: string,
    payload?: T,
    ack?: (resp?: any, err?: any) => void
  ) {
    if (!this.socket || !this.socket.connected) {
      this.queuedEmits.push({ event, payload, ack });
      return;
    }
    this.socket.emit(event, payload, ack);
  }

  private flushQueue() {
    if (!this.socket?.connected) return;
    while (this.queuedEmits.length) {
      const item = this.queuedEmits.shift();
      if (!item) break;
      this.socket.emit(item.event, item.payload, item.ack);
    }
  }

  private emitInternal(event: string, data?: any) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        this.log("listener error", e);
      }
    });
  }

  on<T = any>(event: string, handler: GenericHandler<T>) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as GenericHandler);
    return () => {
      set?.delete(handler as GenericHandler);
    };
  }

  // Stream-related methods removed.
}
