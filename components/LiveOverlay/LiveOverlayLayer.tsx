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
import { isAlertKind, isKnownKind, newWidget, type OverlayKind } from "../../libs/live-overlay/registry";
import type { PublicOverlay } from "../../libs/live-overlay/types";
import { OverlayWidgetView } from "./OverlayWidgets";
import { createRuleBus, RuleAudio, RuleBusContext } from "./ruleBus";
import { PollContext, PollWidget, useStreamPoll } from "./poll";
import { parseRuleFired } from "../../libs/live-overlay/rules";
import type { LiveChatMessageData } from "../../services/livechat.service";
import { createOverlayEventBus, OverlayChatContext, OverlayEventContext, roomUser, type OverlayChatLine } from "./overlayEvents";

interface Props {
  streamId: string;
  overlay: PublicOverlay;
  /** The picture's own size, as the player reports it. Zero until the first frame. */
  videoSize: { width: number; height: number };
  initialViewers: number;
  /** The stream chat the player already holds, for a chat box widget. */
  chatMessages?: LiveChatMessageData[];
}

/** Text messages only, newest last, as the chat box shows them. */
function chatLines(messages: LiveChatMessageData[] | undefined): OverlayChatLine[] {
  if (!messages?.length) return [];
  const lines: OverlayChatLine[] = [];
  for (const m of messages.slice(-24)) {
    const text = typeof m?.content === "string" ? m.content.trim() : "";
    if (!text || m.isDeleted || (m.messageType && m.messageType !== "text")) continue;
    lines.push({
      id: String(m._id),
      text,
      user: roomUser({
        address: m.sender?.address || m.senderAddress,
        username: m.sender?.username,
        displayName: m.sender?.displayName,
        avatarImageUrl: m.sender?.avatarUrl,
      }),
    });
  }
  return lines.slice(-12);
}

/** Tips carry their stream on the row; every other room event carries it beside the payload. */
function payloadStreamId(payload: any): string | undefined {
  const id = payload?.streamId ?? payload?.gift?.streamId;
  return id == null ? undefined : String(id);
}

export default function LiveOverlayLayer({ streamId, overlay, videoSize, initialViewers, chatMessages }: Props) {
  const { on } = useWebSocket();
  const queryClient = useQueryClient();
  const bus = useMemo(() => createOverlayEventBus(), []);
  const rules = useMemo(() => createRuleBus(), []);
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  const visible = useMemo(
    () =>
      overlay.renderIn === "app"
        ? drawOrder(
            overlay.widgets.filter(
              (w) => w.enabled && w.kind !== "poll" && isKnownKind(w.kind) && !(overlay.controls?.alertsPaused && isAlertKind(w.kind)),
            ),
          )
        : [],
    [overlay],
  );

  // A poll is the one thing viewers touch, so it is drawn whatever renderIn
  // says: over an OBS stream it lands on the burned-in copy and covers it with
  // buttons. Where the creator placed it, or the default spot.
  const polls = useStreamPoll(streamId, true);
  const pollWidget = useMemo(
    () => overlay.widgets.find((w) => w.enabled && w.kind === "poll") ?? newWidget("poll", []),
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
        user: payload?.user ? roomUser(payload.user) : undefined,
        selectedTier: payload?.selectedTier || undefined,
        message: payload?.message || undefined,
      });
    });
    bind(LivestreamEvents.StreamReaction, (payload) => {
      if (mine(payload) && typeof payload?.reactionType === "string") {
        bus.publish({ type: "reaction", reactionType: payload.reactionType, user: roomUser(payload?.user) });
      }
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
    // A fired stream rule. Played here only while the overlay is drawn in the
    // app; when OBS burns it into the video, the OBS page plays it.
    bind("stream.rule.fired", (payload) => {
      if (!mine(payload)) return;
      const fired = parseRuleFired(payload);
      if (fired) rules.publish(fired);
    });
    bind(LivestreamEvents.OverlayUpdated, (payload) => {
      if (mine(payload)) void queryClient.invalidateQueries({ queryKey: streamOverlayKey(streamId) });
    });

    return () => offs.forEach((off) => off());
  }, [on, streamId, bus, rules, queryClient]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const hasChatBox = visible.some((w) => w.kind === "chat_box");
  const chat = useMemo(() => (hasChatBox ? chatLines(chatMessages) : []), [hasChatBox, chatMessages]);

  const picture = containedPicture(frame.width, frame.height, videoSize.width, videoSize.height);
  const portrait = isPortraitPicture(videoSize.width, videoSize.height);

  return (
    <OverlayEventContext.Provider value={bus}>
      <OverlayChatContext.Provider value={chat}>
        <RuleBusContext.Provider value={rules}>
          {overlay.renderIn === "app" ? <RuleAudio playLive /> : null}
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
          {picture.width > 0 && polls.poll ? (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {(() => {
                const box = placeWidget(rectFor(pollWidget, portrait), picture);
                return (
                  <View style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, overflow: "hidden" }}>
                    <PollContext.Provider value={{ ...polls, interactive: true }}>
                      <PollWidget settings={pollWidget.settings || {}} box={{ width: box.width, height: box.height }} />
                    </PollContext.Provider>
                  </View>
                );
              })()}
            </View>
          ) : null}
        </RuleBusContext.Provider>
      </OverlayChatContext.Provider>
    </OverlayEventContext.Provider>
  );
}
