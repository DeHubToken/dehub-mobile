import React, { useEffect } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { useReactions } from '../../hooks/useReactions';
import { LivestreamEvents } from '../../services/enums/livestream.enum';
import ReactionOverlay from './ReactionOverlay';

export default function LiveFeedReactionFlow({ streamId }: { streamId: string }) {
  const { on, emit, connected } = useWebSocket();
  const { reactions, addReaction, clearReactions } = useReactions();
  useEffect(() => {
    clearReactions();
    const off = on(LivestreamEvents.StreamReaction, data => {
      if (data?.streamId === streamId) addReaction(data.reactionType, undefined, data.weight);
    });
    if (connected) emit(LivestreamEvents.JoinRoom, { streamId });
    return () => { off(); clearReactions(); };
  }, [streamId, connected, on, emit, addReaction, clearReactions]);
  return <ReactionOverlay reactions={reactions} bottom={12} />;
}
