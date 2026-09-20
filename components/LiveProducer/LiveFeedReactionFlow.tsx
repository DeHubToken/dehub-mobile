import React, { useEffect, useRef } from 'react';
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
  selfAddress,
  self,
}: {
  /**
   * The stream's room. Absent when the feed row never resolved one, which is
   * common — the flow still mounts so the viewer's own reaction has somewhere
   * to land; only the room's copy is lost.
   */
  streamId?: string | null;
  /** The signed-in viewer, lower-cased, so their own echo can be dropped. */
  selfAddress?: string | null;
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
  const meRef = useRef(selfAddress || null);
  useEffect(() => { meRef.current = selfAddress || null; }, [selfAddress]);
  useEffect(() => {
    clearReactions();
    if (!streamId) return;
    const off = on(LivestreamEvents.StreamReaction, data => {
      if (data?.streamId !== streamId) return;
      const from = String(data?.user?.address || '').toLowerCase();
      // Already played on tap — the same reaction coming back round.
      if (from && meRef.current && from === meRef.current) return;
      addReaction(data.reactionType, undefined, data.weight);
    });
    if (connected) emit(LivestreamEvents.JoinRoom, { streamId });
    return () => { off(); clearReactions(); };
  }, [streamId, connected, connectionEpoch, on, emit, addReaction, clearReactions]);

  const lastSelfNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!self || self.nonce === lastSelfNonce.current) return;
    lastSelfNonce.current = self.nonce;
    addReaction(self.type, undefined, self.weight ?? 1);
  }, [self, addReaction]);

  return <ReactionOverlay reactions={reactions} bottom={12} />;
}
