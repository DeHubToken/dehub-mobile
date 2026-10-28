import { useEffect, useState } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { LivestreamEvents } from '../services/enums/livestream.enum';

/**
 * Flips the moment the room says the broadcast is over: the creator pressed
 * End, or the pause grace ran out. Without it a feed card kept trying to play
 * a dead stream until the feed next refetched.
 */
export function useLiveEnded(streamId?: string) {
  const [ended, setEnded] = useState(false);
  const { on, emit, coreConnected, connectionEpoch } = useWebSocket();
  useEffect(() => setEnded(false), [streamId]);
  useEffect(() => {
    if (!streamId) return;
    const off = on(LivestreamEvents.EndStream, (data: any) => {
      if (data?.streamId && String(data.streamId) === String(streamId)) setEnded(true);
    });
    if (coreConnected) emit(LivestreamEvents.JoinRoom, { streamId });
    return off;
  }, [streamId, coreConnected, connectionEpoch, on, emit]);
  return ended;
}
