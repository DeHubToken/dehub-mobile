const mock = jest;
import { cloudProjectPresence, type PresenceState, type PresenceSocket } from "../../libs/editor/cloudProjectPresence";
import { notifyCloudProjectSaved, onCloudProjectSaved } from "../../libs/editor/cloudProjectEvents";
import { cloudProjectSession, type CloudProjectSessionDeps } from "../../libs/editor/cloudProjectSession";
const actor = "0x" + "a".repeat(40), owner = "0x" + "b".repeat(40), id = "11111111-1111-4111-8111-111111111111";
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(session = async () => ({ token: "private-session", expiresAt: Date.now() + 3600000 })) {
  const socket: PresenceSocket = { onopen: null, onmessage: null, onclose: null, onerror: null, send: mock.fn(), close: mock.fn() };
  const connect = mock.fn(() => socket), update = mock.fn((_state: PresenceState) => {});
  const client = cloudProjectPresence(actor, { owner, projectId: id, revision: 3 }, { session, socket: connect, update });
  const message = (data: unknown) => socket.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  return { client, socket, connect, update, message, state: () => update.mock.calls[update.mock.calls.length - 1][0] };
}
const presence = (revision = 3) => ({ type: "presence", revision, participants: [{ wallet: actor, connections: 1 }] });
describe("private cloud project presence", () => {
  beforeEach(() => mock.useFakeTimers());
  afterEach(() => mock.useRealTimers());
  it("authenticates only in the first frame and keeps credentials out of the URL", async () => {
    const env = setup(); await tick(); expect(env.connect).toHaveBeenCalledWith(`wss://dehub.io/api/editor/presence/${owner}/${id}`);
    expect(env.socket.send).not.toHaveBeenCalled(); env.socket.onopen?.();
    expect(JSON.parse((env.socket.send as ReturnType<typeof mock.fn>).mock.calls[0][0])).toEqual({ type: "join", wallet: actor, token: "private-session" }); env.client.stop();
  });
  it("shows validated participants and advances the saved head", async () => {
    const env = setup(); await tick(); env.message(presence(4)); expect(env.state()).toMatchObject({ status: "connected", revision: 4, participants: [{ wallet: actor, connections: 1 }] }); env.client.stop();
  });
  it.each(["missing account", "duplicate account", "old revision", "oversize", "malformed", "zero connections"])("rejects %s", async kind => {
    const env = setup(); await tick();
    const value = kind === "missing account" ? { ...presence(), participants: [{ wallet: owner, connections: 1 }] } : kind === "duplicate account" ? { ...presence(), participants: [{ wallet: actor, connections: 1 }, { wallet: actor, connections: 1 }] } : kind === "old revision" ? presence(2) : kind === "oversize" ? "x".repeat(8193) : kind === "malformed" ? "{" : { ...presence(), participants: [{ wallet: actor, connections: 0 }] };
    env.message(value); expect(env.state().status).toBe("error"); expect(env.socket.close).toHaveBeenCalledTimes(1); env.client.stop();
  });
  it("does not open a socket when a late session arrives after leaving", async () => {
    let resolve!: (value: { token: string; expiresAt: number }) => void;
    const env = setup(() => new Promise(done => { resolve = done; })); env.client.stop(); resolve({ token: "late", expiresAt: Date.now() + 3600000 }); await tick(); expect(env.connect).not.toHaveBeenCalled();
  });
  it("times out once without retrying or emitting late credentials", async () => {
    let resolve!: (value: { token: string; expiresAt: number }) => void;
    const env = setup(() => new Promise(done => { resolve = done; })); mock.advanceTimersByTime(12000); expect(env.state().status).toBe("error");
    resolve({ token: "late", expiresAt: Date.now() + 3600000 }); await tick(); mock.advanceTimersByTime(120000); expect(env.connect).not.toHaveBeenCalled(); env.client.stop();
  });
  it("coalesces explicit refreshes and stops all timers on leaving", async () => {
    const env = setup(); await tick(); env.message(presence()); env.client.refresh(4); env.client.refresh(4); mock.advanceTimersByTime(100);
    expect(env.socket.send).toHaveBeenCalledTimes(1); expect(env.socket.send).toHaveBeenCalledWith('{"type":"refresh"}'); env.client.refresh(5); env.client.stop(); mock.advanceTimersByTime(1000); expect(env.socket.send).toHaveBeenCalledTimes(1);
  });
  it("does not reconnect after network closure", async () => {
    const env = setup(); await tick(); env.message(presence()); env.socket.onclose?.(); expect(env.state().status).toBe("disconnected"); mock.advanceTimersByTime(120000); expect(env.connect).toHaveBeenCalledTimes(1); env.client.stop();
  });
  it("isolates save observers from completed saves", () => {
    const second = mock.fn(), first = onCloudProjectSaved(() => { throw new Error("observer"); }), last = onCloudProjectSaved(second);
    const event = { wallet: actor, owner, projectId: id, revision: 4 }; expect(() => notifyCloudProjectSaved(event)).not.toThrow(); expect(second).toHaveBeenCalledWith(event); first(); last();
  });
  it("reads only this wallet's already-saved cloud binding", async () => {
    let link: { wallet: string; projectId: string; revision: number; media: {}; sharedOwner?: string } | null = { wallet: actor, projectId: id, revision: 3, media: {}, sharedOwner: owner };
    const deps = { wallet: actor, check: mock.fn(), readLink: async () => link } as unknown as CloudProjectSessionDeps;
    const session = cloudProjectSession(deps); expect(await session.binding("local")).toEqual({ owner, projectId: id, revision: 3 });
    link = { ...link!, wallet: owner }; expect(await session.binding("local")).toBeNull(); link = { ...link!, wallet: actor, revision: 0 }; expect(await session.binding("local")).toBeNull(); link = null; expect(await session.binding("local")).toBeNull();
  });
});
