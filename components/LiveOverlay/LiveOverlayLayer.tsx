/**
 * A creator's overlay, drawn over their stream in the viewer's own player. The
 * twin of dehubweb src/components/app/live/overlay/LiveOverlayLayer.tsx.
 *
 * Every DeHub viewer draws the creator's widgets locally from the stream's room
 * events, whatever the stream comes from. When the creator has moved the
 * overlay into their video through OBS (`renderIn: 'video'`) this draws
 * nothing, or every alert would land twice.
 *
 * The room itself is joined by LiveStreamPlayer (and re-joined on every core
 * reconnect); this only listens.
 */
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "../../context/WebSocketContext";
import { streamOverlayKey } from "../../hooks/useStreamOverlay";
import { LivestreamEvents } from "../../services/enums/livestream.enum";
import { containedPicture, drawOrder, isPortraitPicture, placeWidget, rectFor } from "../../libs/live-overlay/layout";
import { isKnownKind, type OverlayKind } from "../../libs/live-overlay/registry";
import type { PublicOverlay } from "../../libs/live-overlay/types";
import { OverlayWidgetView } from "./OverlayWidgets";
import { createOverlayEventBus, OverlayEventContext, roomUser } from "./overlayEvents";

interface Props {
  streamId: string;
  overlay: PublicOverlay;
  /** The picture's own size, as the player reports it. Zero until the first frame. */
  videoSize: { width: number; height: number };
  initialViewers: number;
}

/** Tips carry their stream on the row; every other room event carries it beside the payload. */
function payloadStreamId(payload: any): string | undefined {
  const id = payload?.streamId ?? payload?.gift?.streamId;
  return id == null ? undefined : String(id);
}

export default function LiveOverlayLayer({ streamId, overlay, videoSize, initialViewers }: Props) {
  const { on } = useWebSocket();
  const queryClient = useQueryClient();
  const bus = useMemo(() => createOverlayEventBus(), []);
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  const visible = useMemo(
    () => (overlay.renderIn === "app" ? drawOrder(overlay.widgets.filter((w) => w.enabled && isKnownKind(w.kind))) : []),
    [overlay],
  );

  useEffect(() => {
    const mine = (payload: any) => payloadStreamId(payload) === streamId;
    const offs: Array<() => void> = [];
    const bind = (event: string, handler: (payload: any) => void) => {
      const off = on(event, handler);
      if (typeof off === "function") offs.push(off);
    };

    bind(LivestreamEvents.TipStreamer, (payload) => {
      if (!mine(payload)) return;
      const meta = payload?.gift?.meta ?? payload?.meta ?? {};
      const amount = Number(meta.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      bus.publish({
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
      bus.publish({
        type: "tipConfirmed",
        paidAmount,
        address: String(payload?.address || "").toLowerCase(),
        transactionHash: String(payload?.transactionHash || "").toLowerCase(),
      });
    });
    bind(LivestreamEvents.Follow, (payload) => {
      if (mine(payload)) bus.publish({ type: "follow", user: roomUser(payload?.user) });
    });
    bind(LivestreamEvents.Share, (payload) => {
      if (mine(payload)) bus.publish({ type: "share", user: roomUser(payload?.user) });
    });
    bind(LivestreamEvents.Subscribe, (payload) => {
      if (mine(payload)) bus.publish({ type: "subscribe", user: roomUser(payload?.user), planName: payload?.planName || undefined });
    });
    bind(LivestreamEvents.JoinStream, (payload) => {
      if (!mine(payload)) return;
      if (payload?.user?.address) bus.publish({ type: "join", user: roomUser(payload.user) });
      if (typeof payload?.viewerCount === "number") bus.publish({ type: "viewers", count: payload.viewerCount });
    });
    const onCount = (payload: any) => {
      if (mine(payload) && typeof payload?.viewerCount === "number") bus.publish({ type: "viewers", count: payload.viewerCount });
    };
    bind(LivestreamEvents.ViewCountUpdate, onCount);
    bind(LivestreamEvents.LeaveStream, onCount);
    bind(LivestreamEvents.OverlayUpdated, (payload) => {
      if (mine(payload)) void queryClient.invalidateQueries({ queryKey: streamOverlayKey(streamId) });
    });

    return () => offs.forEach((off) => off());
  }, [on, streamId, bus, queryClient]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const picture = containedPicture(frame.width, frame.height, videoSize.width, videoSize.height);
  const portrait = isPortraitPicture(videoSize.width, videoSize.height);

  return (
    <OverlayEventContext.Provider value={bus}>
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
                  stats={overlay.stats}
                  initialViewers={initialViewers}
                  box={{ width: box.width, height: box.height }}
                />
              </View>
            );
          })}
      </View>
    </OverlayEventContext.Provider>
  );
}
