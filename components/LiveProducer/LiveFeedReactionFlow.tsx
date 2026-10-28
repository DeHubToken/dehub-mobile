import React, { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import env from '../../config/env';
import { useAuthState } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { useReactions } from '../../hooks/useReactions';
import { LivestreamEvents } from '../../services/enums/livestream.enum';
import ReactionOverlay from './ReactionOverlay';

/**
 * What the viewer who tapped is about to see, played locally.
 *
 * `nonce` is what makes a repeat of the same reaction a new particle; the type
 * alone cannot, because tapping the thumb twice is the common case.
 */
export interface SelfReaction {
  type: unknown;
  weight?: number;
  nonce: number;
}

export default function LiveFeedReactionFlow({
  streamId,
  self,
  laneHeight,
}: {
  /** How far the emoji climb. Set, the lane is not clipped either: the feed
   *  lets them drift a little past the picture's edge. */
  laneHeight?: number;
  /**
   * The stream's room. Absent when the feed row never resolved one, which is
   * common — the flow still mounts so the viewer's own reaction has somewhere
   * to land; only the room's copy is lost.
   */
  streamId?: string | null;
  /**
   * The viewer's own reaction, played the instant they tap it — the same beat
   * a tipper gets their celebration on. The echo is what the room sees; it is
   * no longer the only source, so a dropped socket no longer means the person
   * who tapped sees nothing at all.
   */
  self?: SelfReaction | null;
}) {
  // Reactions are a core-namespace room, and every core connection is a fresh
  // room to join — the epoch below is what makes the re-join happen.
  const { on, emit, coreConnected: connected, connectionEpoch } = useWebSocket();
  const { reactions, addReaction, clearReactions } = useReactions();
  const { isSignedIn } = useAuthState();
  useEffect(() => {
    clearReactions();
    if (!streamId) return;
    const receive = (data: any) => {
      if (data?.streamId !== streamId) return;
      // Already played on tap — the same reaction coming back round.
      if (data?.isOwnReaction) return;
      addReaction(data.reactionType, undefined, data.weight);
    };
    if (isSignedIn) {
      const off = on(LivestreamEvents.StreamReaction, receive);
      if (connected) emit(LivestreamEvents.JoinRoom, { streamId });
      return () => { off(); clearReactions(); };
    }
    // The shared socket only exists for signed-in accounts, so a visitor
    // scrolling past a live saw nobody's reactions. The room is open to
    // anyone; listen on a socket of our own while this card is on screen.
    const socket = io((env.WEBSOCKET_URL || 'https://api.dehub.io').replace(/\/socket\.io\/?$/i, ''), {
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => socket.emit(LivestreamEvents.JoinRoom, { streamId }));
    socket.on(LivestreamEvents.StreamReaction, receive);
    return () => { socket.disconnect(); clearReactions(); };
  }, [streamId, isSignedIn, connected, connectionEpoch, on, emit, addReaction, clearReactions]);

  const lastSelfNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!self || self.nonce === lastSelfNonce.current) return;
    lastSelfNonce.current = self.nonce;
    addReaction(self.type, undefined, self.weight ?? 1);
  }, [self, addReaction]);

  return <ReactionOverlay reactions={reactions} bottom={12} maxHeight={laneHeight} clip={laneHeight == null} />;
}
