/**
 * A creator's overlay over the REPLAY of a stream. The twin of dehubweb
 * src/components/app/live/overlay/ReplayOverlayLayer.tsx.
 *
 * The stream's own activity log (paid gifts, joins, reactions) is played into
 * the same widgets at the moment each happened, against the replay's clock.
 * Seeking jumps without replaying what was skipped. Only for overlays drawn in
 * the app: an OBS stream already has them burned into its recording.
 */
import React, { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../libs";
import { containedPicture, drawOrder, isPortraitPicture, placeWidget, rectFor } from "../../libs/live-overlay/layout";
import { isKnownKind, type OverlayKind } from "../../libs/live-overlay/registry";
import type { PublicOverlay } from "../../libs/live-overlay/types";
import { OverlayWidgetView } from "./OverlayWidgets";
import { createOverlayEventBus, OverlayChatContext, OverlayEventContext, roomUser, type LiveRoomEvent } from "./overlayEvents";

/** Widgets the log can drive. Live-only ones stay off a replay. */
const REPLAYABLE = new Set(["tip_alert", "join_alert", "goal_bar", "top_supporters", "text", "frame", "reaction_counter", "event_feed", "ticker"]);
const PAGE = 200;
const MAX_PAGES = 5;
const SEEK_MS = 4000;
const TICK_MS = 250;

interface Timed {
  at: number;
  events: LiveRoomEvent[];
}

interface Props {
  streamId: string;
  overlay: PublicOverlay;
  videoSize: { width: number; height: number };
  /** Where the replay is, in ms, as the player last reported it. */
  positionRef: MutableRefObject<number>;
}

async function loadTimeline(streamId: string): Promise<Timed[]> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: any = await apiClient.get<any>(
      `/live/${encodeURIComponent(streamId)}/activities?limit=${PAGE}&skip=${page * PAGE}&order=asc`,
      { isAuthRequired: false },
    );
    const body = res?.result ?? res?.data ?? res;
    const batch: any[] = Array.isArray(body) ? body : [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const start = rows.find((r) => r?.status === "START") ?? rows[0];
  const t0 = start?.createdAt ? new Date(start.createdAt).getTime() : NaN;
  if (!Number.isFinite(t0)) return [];

  const out: Timed[] = [];
  for (const r of rows) {
    const at = new Date(r?.createdAt).getTime() - t0;
    if (!Number.isFinite(at) || at < 0) continue;
    const a = r?.account ?? {};
    const m = r?.meta ?? {};
    const user = roomUser({
      address: r?.address || m.address,
      username: a.username || m.username,
      displayName: a.displayName || m.displayName,
      avatarImageUrl: a.avatarImageUrl || m.avatarImageUrl,
    });
    if (r.status === "TIP" && m.paymentStatus === "confirmed") {
      const paid = Number(m.paidAmount ?? m.amount) || 0;
      if (paid <= 0) continue;
      const transactionHash = String(m.transactionHash || r._id || "").toLowerCase();
      out.push({
        at,
        events: [
          { type: "tip", amount: paid, selectedTier: m.selectedTier || undefined, user, message: m.message || undefined, transactionHash },
          { type: "tipConfirmed", paidAmount: paid, address: String(user.address || ""), transactionHash, user },
        ],
      });
    } else if (r.status === "JOINED" && user.address) {
      out.push({ at, events: [{ type: "join", user }] });
    } else if (r.status === "REACTION" && typeof m.reactionType === "string") {
      out.push({ at, events: [{ type: "reaction", reactionType: m.reactionType, user }] });
    }
  }
  return out;
}

export default function ReplayOverlayLayer({ streamId, overlay, videoSize, positionRef }: Props) {
  const bus = useMemo(() => createOverlayEventBus(), []);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const { data: timeline } = useQuery({
    queryKey: ["replay-timeline", streamId],
    queryFn: () => loadTimeline(streamId),
    staleTime: 10 * 60_000,
  });

  const visible = useMemo(() => drawOrder(overlay.widgets.filter((w) => w.enabled && isKnownKind(w.kind) && REPLAYABLE.has(w.kind))), [overlay]);
  // A replay starts from nothing: the goal bar and reaction counter count up as it plays.
  const stats = useMemo(() => ({ ...overlay.stats, totalTips: 0, reactions: 0, startedAt: null }), [overlay.stats]);

  useEffect(() => {
    if (!timeline?.length) return;
    const indexAfter = (t: number) => {
      const i = timeline.findIndex((x) => x.at > t);
      return i === -1 ? timeline.length : i;
    };
    let last = positionRef.current;
    let next = indexAfter(last);
    const id = setInterval(() => {
      const t = positionRef.current;
      if (t < last || t - last > SEEK_MS) {
        last = t;
        next = indexAfter(t);
        return;
      }
      while (next !== timeline.length && timeline[next].at <= t) {
        timeline[next].events.forEach((event) => bus.publish(event));
        next += 1;
      }
      last = t;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [timeline, bus, positionRef]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const picture = containedPicture(frame.width, frame.height, videoSize.width, videoSize.height);
  const portrait = isPortraitPicture(videoSize.width, videoSize.height);

  return (
    <OverlayEventContext.Provider value={bus}>
      <OverlayChatContext.Provider value={[]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
          {picture.width > 0 &&
            visible.map((widget) => {
              const box = placeWidget(rectFor(widget, portrait), picture);
              return (
                <View
                  key={widget.id}
                  style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden" }}
                >
                  <OverlayWidgetView
                    kind={widget.kind as OverlayKind}
                    settings={widget.settings || {}}
                    streamId={streamId}
                    stats={stats}
                    initialViewers={0}
                    box={{ width: box.width, height: box.height }}
                  />
                </View>
              );
            })}
        </View>
      </OverlayChatContext.Provider>
    </OverlayEventContext.Provider>
  );
}
