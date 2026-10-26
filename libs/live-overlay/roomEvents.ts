import { LivestreamEvents } from "../../services/enums/livestream.enum";
import type { LiveRoomEvent, RoomUser } from "../../components/LiveOverlay/overlayEvents";

/**
 * The room events an overlay reacts to, read off the stream's socket and
 * turned into LiveRoomEvents. Shared by the viewer's overlay layer
 * (components/LiveOverlay/LiveOverlayLayer.tsx) and the phone studio, which
 * paints the same widgets into the creator's outgoing video.
 */

type On = (event: string, handler: (payload: any) => void) => unknown;

export function roomUser(raw: any): RoomUser {
  const user = raw && typeof raw === "object" ? raw : {};
  return {
    address: user.address ? String(user.address).toLowerCase() : undefined,
    username: user.username || undefined,
    displayName: user.displayName || undefined,
    avatarImageUrl: user.avatarImageUrl || undefined,
  };
}

/** Tips carry their stream on the row; every other room event carries it beside the payload. */
export function payloadStreamId(payload: any): string | undefined {
  const id = payload?.streamId ?? payload?.gift?.streamId;
  return id == null ? undefined : String(id);
}

/**
 * Subscribe to `streamId`'s room events. Returns the unsubscribers; call
 * each on cleanup.
 */
export function bindRoomEvents(on: On, streamId: string, publish: (event: LiveRoomEvent) => void): Array<() => void> {
  const mine = (payload: any) => payloadStreamId(payload) === streamId;
  const offs: Array<() => void> = [];
  const bind = (event: string, handler: (payload: any) => void) => {
    const off = on(event, handler);
    if (typeof off === "function") offs.push(off as () => void);
  };

  bind(LivestreamEvents.TipStreamer, (payload) => {
    if (!mine(payload)) return;
    const meta = payload?.gift?.meta ?? payload?.meta ?? {};
    const amount = Number(meta.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    publish({
      type: "tip",
      amount,
      selectedTier: meta.selectedTier || undefined,
      user: roomUser({
        address: meta.address || payload?.gift?.address,
        username: meta.username,
        displayName: meta.displayName,
        avatarImageUrl: meta.avatarImageUrl,
      }),
      message: meta.message || undefined,
      transactionHash: String(meta.transactionHash || "").toLowerCase() || undefined,
    });
  });
  bind(LivestreamEvents.TipConfirmed, (payload) => {
    if (!mine(payload)) return;
    const paidAmount = Number(payload?.paidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) return;
    publish({
      type: "tipConfirmed",
      paidAmount,
      address: String(payload?.address || "").toLowerCase(),
      transactionHash: String(payload?.transactionHash || "").toLowerCase(),
      user: payload?.user ? roomUser(payload.user) : undefined,
      selectedTier: payload?.selectedTier || undefined,
      message: payload?.message || undefined,
    });
  });
  bind(LivestreamEvents.StreamReaction, (payload) => {
    if (mine(payload) && typeof payload?.reactionType === "string") {
      publish({ type: "reaction", reactionType: payload.reactionType, user: roomUser(payload?.user) });
    }
  });
  bind(LivestreamEvents.Follow, (payload) => {
    if (mine(payload)) publish({ type: "follow", user: roomUser(payload?.user) });
  });
  bind(LivestreamEvents.Share, (payload) => {
    if (mine(payload)) publish({ type: "share", user: roomUser(payload?.user) });
  });
  bind(LivestreamEvents.Subscribe, (payload) => {
    if (mine(payload)) publish({ type: "subscribe", user: roomUser(payload?.user), planName: payload?.planName || undefined });
  });
  bind(LivestreamEvents.JoinStream, (payload) => {
    if (!mine(payload)) return;
    if (payload?.user?.address) publish({ type: "join", user: roomUser(payload.user) });
    if (typeof payload?.viewerCount === "number") publish({ type: "viewers", count: payload.viewerCount });
  });
  const onCount = (payload: any) => {
    if (mine(payload) && typeof payload?.viewerCount === "number") publish({ type: "viewers", count: payload.viewerCount });
  };
  bind(LivestreamEvents.ViewCountUpdate, onCount);
  bind(LivestreamEvents.LeaveStream, onCount);
  return offs;
}
