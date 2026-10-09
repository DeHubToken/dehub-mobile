export interface PresenceTarget { owner: string; projectId: string; revision: number }
export interface PresenceState { status: "idle" | "connecting" | "connected" | "disconnected" | "error"; revision: number; participants: { wallet: string; connections: number }[]; error: string }
export interface PresenceSocket {
  onopen: (() => void) | null; onmessage: ((event: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null;
  send(data: string): void; close(): void;
}
export const emptyPresence = (): PresenceState => ({ status: "idle", revision: 0, participants: [], error: "" });
const walletPattern = /^0x[a-f0-9]{40}$/;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** Explicitly joined, event-driven presence. No keepalive, reconnect loop or draft upload. */
export function cloudProjectPresence(wallet: string, target: PresenceTarget, deps: { session(): Promise<{ token: string; expiresAt: number } | null>; socket(url: string): PresenceSocket; update(state: PresenceState): void }) {
  let socket: PresenceSocket | null = null, stopped = false, ready = false, revision = target.revision;
  let lastRefresh = 0, requestedRevision = target.revision;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const update = (status: PresenceState["status"], error = "", participants: PresenceState["participants"] = []) => { if (!stopped) deps.update({ status, error, participants, revision }); };
  function finish(status: PresenceState["status"], error = "") {
    clearTimeout(deadline); clearTimeout(refreshTimer); ready = false;
    const old = socket; socket = null;
    if (old) { old.onopen = old.onmessage = old.onclose = old.onerror = null; try { old.close(); } catch { /* already closed */ } }
    update(status, error);
  }
  async function start() {
    if (!walletPattern.test(wallet) || !walletPattern.test(target.owner) || !idPattern.test(target.projectId) || !Number.isInteger(revision) || revision < 1) { update("error", "Save this project to cloud before joining a live session."); return; }
    update("connecting");
    deadline = setTimeout(() => { finish("error", "Live session timed out. Join again when connected."); stopped = true; }, 12000);
    try {
      const session = await deps.session();
      if (stopped) return;
      if (!session || session.expiresAt <= Date.now() + 30000) { finish("error", "Sign in again to join this live session."); stopped = true; return; }
      socket = deps.socket(`wss://dehub.io/api/editor/presence/${target.owner}/${target.projectId}`);
      socket.onopen = () => { try { lastRefresh = Date.now(); socket?.send(JSON.stringify({ type: "join", wallet, token: session.token })); } catch { finish("error", "Live session could not connect."); } };
      socket.onmessage = event => {
        try {
          if (typeof event.data !== "string" || event.data.length > 8192) throw new Error("message");
          const data = JSON.parse(event.data);
          if (data.type === "error") { finish("error", "Live editing access is unavailable. Check your invitation and sign in again."); return; }
          if (data.type !== "presence" || !Number.isInteger(data.revision) || data.revision < revision || !Array.isArray(data.participants) || data.participants.length > 32 || data.participants.some((p: { wallet: string; connections: number }) => !p || !walletPattern.test(p.wallet) || !Number.isInteger(p.connections) || p.connections < 1 || p.connections > 32) || new Set(data.participants.map((p: { wallet: string }) => p.wallet)).size !== data.participants.length || !data.participants.some((p: { wallet: string }) => p.wallet === wallet)) throw new Error("message");
          revision = data.revision; ready = true; clearTimeout(deadline); update("connected", "", data.participants);
        } catch { finish("error", "Live session returned an invalid update."); }
      };
      socket.onclose = () => finish("disconnected");
      socket.onerror = () => finish("error", "Live session could not connect. Join again when connected.");
    } catch { if (!stopped) { finish("error", "Live session could not connect. Join again when connected."); stopped = true; } }
  }
  void start();
  return {
    refresh(head?: number) {
      if (!ready || stopped || (head !== undefined && head <= requestedRevision)) return;
      if (head !== undefined) requestedRevision = head;
      if (refreshTimer) return;
      const send = () => { refreshTimer = undefined; if (ready && !stopped) { lastRefresh = Date.now(); try { socket?.send('{"type":"refresh"}'); } catch { finish("error", "Live session disconnected."); } } };
      const wait = 500 - (Date.now() - lastRefresh);
      if (wait <= 0) send(); else refreshTimer = setTimeout(send, wait);
    },
    stop() { stopped = true; finish("idle"); },
  };
}
