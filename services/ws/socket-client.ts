import { io, Socket } from "socket.io-client";
import { GenericHandler } from "./events";
import { createLogger } from "../../libs/logger";

export interface WebSocketClientOptions {
  url: string;
  getAuthToken: () => string | null;
  getAddress?: () => string | null;
  autoConnect?: boolean;
  heartbeatIntervalMs?: number;
  reconnectAttempts?: number;
  timeoutMs?: number;
  debug?: boolean;
}

type ListenerMap = Map<string, Set<GenericHandler>>;

export class WebSocketClient {
  private socket: Socket | null = null;
  private opts: Omit<Required<WebSocketClientOptions>, "getAddress"> & {
    getAddress: () => string | null;
  };
  private connecting = false;
  private connectAttemptTimer: any = null;
  private heartbeatTimer: any = null;
  private pingCheckTimer: any = null;
  private lastIoPingAt: number | null = null;
  private lastIoPongAt: number | null = null;
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
      reconnectAttempts: 20,
      timeoutMs: 20000,
      debug: false,
      getAddress: () => null,
      ...opts,
    } as any;
    if (this.opts.autoConnect) this.connect();
  }

  private log(...args: any[]) {
    // Delegate logging to shared logger; still honor opts.debug
    if (!this.logger) this.logger = createLogger('WS');
    if (!this.opts.debug) return;
    this.logger.debug(...args);
  }

  private logger = createLogger('WS');

  private buildSocket() {
    // ensure any previous "connecting" state is cleared when (re)building
    this.connecting = false;
    this.clearConnectAttemptTimer();

    const token = this.opts.getAuthToken();
    const address = this.opts.getAddress ? this.opts.getAddress() : null;
    this.lastAuthToken = token;
    this.lastAddress = address;

    const handshakeAuth: any = {};
    if (token) handshakeAuth.token = token;
    if (address) handshakeAuth.address = address;

    const transports = ["polling", "websocket"] as const;
    const path = "/socket.io/"; // FE parity (trailing slash)

    this.log(
      "buildSocket(): url=",
      this.opts.url,
      "path=",
      path,
      "transports=",
      transports.join(",")
    );

    this.socket = io(this.opts.url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.opts.reconnectAttempts,
      transports: Array.from(transports) as any,
      upgrade: true,
      autoConnect: false,
      forceNew: true,
      timeout: this.opts.timeoutMs,
      auth: handshakeAuth,
      query: handshakeAuth,
      path,
    });

    // Optional: observe server-sent heartbeat event if any
    this.socket.on("heartbeat", (data: any) => {
      this.log("heartbeat <- recv", data);
    });

    this.socket.on("connect", () => {
      this.log("connected", this.socket?.id);
      this.connecting = false;
      this.clearConnectAttemptTimer();
      this.flushQueue();
      this.startHeartbeat();
      this.startPingCheck();
      this.emitInternal("connected");
    });

    this.socket.on("disconnect", (reason) => {
      this.log("disconnect", reason);
      this.connecting = false;
      this.clearConnectAttemptTimer();
      this.stopHeartbeat();
      this.stopPingCheck();
      this.emitInternal("disconnected");
    });

    this.socket.on("connect_error", (err: any) => {
      this.log("connect_error", err?.message);
      this.connecting = false;
      this.clearConnectAttemptTimer();
      this.stopHeartbeat();
      this.stopPingCheck();
      if (err?.message?.toLowerCase().includes("unauthorized")) {
        this.log("auth failed, retrying without token");
        this.lastAuthToken = null;
      }
      this.emitInternal("connect_error", err);
    });

    // Reconnection diagnostics
    // @ts-ignore
    this.socket.io.on("reconnect_attempt", (n: number) => {
      this.log("reconnect_attempt", n);
      this.connecting = true;
      this.startConnectAttemptTimer();
    });
    // @ts-ignore
    this.socket.io.on("reconnect_error", (e: any) => this.log("reconnect_error", e?.message || e));
    // @ts-ignore
    this.socket.io.on("reconnect_failed", () => this.log("reconnect_failed"));

    // Socket.IO Manager ping/pong (keepalive) diagnostics
    // @ts-ignore
    this.socket.io.on("ping", () => {
      this.lastIoPingAt = Date.now();
      this.log("io ping");
    });
    // @ts-ignore
    this.socket.io.on("pong", (ms: number) => {
      this.lastIoPongAt = Date.now();
      this.log("io pong", ms, "ms");
    });

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
      // Packet-level ping/pong visibility
      engine.on("packet", (pkt: any) => {
        const t = pkt?.type;
        if (t === "ping" || t === "pong") this.log("engine", t);
      });
    }
  }

  connect() {
    this.log("connecting", {
      connected: this.socket?.connected,
      connecting: this.connecting,
      destroyed: this.destroyed,
    });
    if (this.destroyed || this.connecting) return;
    if (this.socket && this.socket.connected) return;
    if (!this.socket) this.buildSocket();

    this.connecting = true;
    try {
      this.socket?.connect();
      this.startConnectAttemptTimer();
    } catch {}
  }

  // Built-in reconnection is enabled; no manual scheduleReconnect needed

  private destroySocketOnly() {
    try {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
    } catch {}
    this.connecting = false;
    this.clearConnectAttemptTimer();
    this.socket = null;
  }

  disconnect() {
    this.destroyed = true;
    this.stopHeartbeat();
    this.stopPingCheck();
    this.destroySocketOnly();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Match frontend: emit 'heartbeat' every ~10s by default; respect configured interval
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.log("heartbeat -> emit", new Date().toISOString());
        this.socket.emit("heartbeat");
      }
    }, Math.max(10000, this.opts.heartbeatIntervalMs));
  }
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Periodic round-trip check (debug-only)
  private startPingCheck() {
    this.stopPingCheck();
    if (!this.opts.debug) return; // only when debug logging is enabled
    this.pingCheckTimer = setInterval(() => {
      this.pingCheck().catch(() => {});
    }, 60000); // every 60s
  }
  private stopPingCheck() {
    if (this.pingCheckTimer) {
      clearInterval(this.pingCheckTimer);
      this.pingCheckTimer = null;
    }
  }

  /**
   * Perform a round-trip check by emitting a 'ping' event with an ack and waiting up to timeoutMs.
   * Logs either the ack RTT or a timeout, all gated by debug logger.
   */
  async pingCheck(timeoutMs: number = 5000): Promise<void> {
    if (!this.socket || !this.socket.connected) {
      this.log("pingCheck skipped: socket not connected");
      return;
    }
    const ts = Date.now();
    this.log("pingCheck -> emit 'ping'", { ts, timeoutMs });
    const sAny: any = this.socket as any;
    return new Promise<void>((resolve) => {
      // Prefer Socket.IO timeout helper if available
      if (typeof sAny.timeout === "function") {
        try {
          sAny.timeout(timeoutMs).emit("ping", { ts }, (err: any, resp: any) => {
            if (err) {
              this.log("pingCheck timeout", { afterMs: Date.now() - ts, stillConnected: !!this.socket?.connected });
            } else {
              const rtt = Date.now() - ts;
              this.log("pingCheck <- ack", { rttMs: rtt, resp });
            }
            resolve();
          });
          return;
        } catch {}
      }
      // Fallback manual timeout + ack
      let settled = false;
      const to = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.log("pingCheck timeout", { afterMs: Date.now() - ts, stillConnected: !!this.socket?.connected });
          resolve();
        }
      }, timeoutMs);
      try {
        this.socket!.emit("ping", { ts }, (resp: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(to);
            const rtt = Date.now() - ts;
            this.log("pingCheck <- ack", { rttMs: rtt, resp });
            resolve();
          }
        });
      } catch {
        // If emit throws synchronously
        if (!settled) {
          settled = true;
          clearTimeout(to);
          this.log("pingCheck emit error");
          resolve();
        }
      }
    });
  }

  private startConnectAttemptTimer() {
    this.clearConnectAttemptTimer();
    const timeout = (this.opts.timeoutMs ?? 20000) + 2000;
    this.connectAttemptTimer = setTimeout(() => {
      if (!this.socket?.connected) {
        this.log("connect attempt timed out; clearing connecting flag");
        this.connecting = false;
      }
    }, timeout);
  }

  private clearConnectAttemptTimer() {
    if (this.connectAttemptTimer) {
      clearTimeout(this.connectAttemptTimer);
      this.connectAttemptTimer = null;
    }
  }

  updateAuth() {
    if (this.destroyed) return;
    const newToken = this.opts.getAuthToken();
    const newAddress = this.opts.getAddress ? this.opts.getAddress() : null;
    if (newToken === this.lastAuthToken && newAddress === this.lastAddress) return;
    this.log("auth/address updated, reconnecting");
    this.lastAuthToken = newToken;
    this.lastAddress = newAddress;
    this.destroySocketOnly();
    this.buildSocket();
    this.connect();
  }

  emit<T = any>(event: string, payload?: T, ack?: (resp?: any, err?: any) => void) {
    // Queue if not connected yet
    if (!this.socket || !this.socket.connected) {
      this.queuedEmits.push({ event, payload, ack });
      return;
    }
    if (typeof ack === "function") {
      this.socket.emit(event, payload, ack);
    } else {
      this.socket.emit(event, payload);
    }
  }

  private flushQueue() {
    if (!this.socket?.connected) return;
    while (this.queuedEmits.length) {
      const item = this.queuedEmits.shift();
      if (!item) break;
      const { event, payload, ack } = item;
      if (typeof ack === "function") {
        this.socket.emit(event, payload, ack);
      } else {
        this.socket.emit(event, payload);
      }
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
