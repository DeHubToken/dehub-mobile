import { useEffect, useState } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { LivestreamEvents } from '../services/enums/livestream.enum';

/** Keep visible feed/profile players in step with the broadcaster. */
export function useLivePaused(streamId?: string, initialStatus?: string) {
  const [paused, setPaused] = useState(initialStatus?.toUpperCase() === 'PAUSED');
  const { on, emit, coreConnected, connectionEpoch } = useWebSocket();
  useEffect(() => setPaused(initialStatus?.toUpperCase() === 'PAUSED'), [streamId, initialStatus]);
  useEffect(() => {
    if (!streamId) return;
    const update = (value: boolean) => (data: any) => {
      if (data?.streamId === streamId) setPaused(value);
    };
    const offPaused = on(LivestreamEvents.StreamPaused, update(true));
    const offResumed = on(LivestreamEvents.StreamResumed, update(false));
    const offStarted = on(LivestreamEvents.StartStream, update(false));
    if (coreConnected) emit(LivestreamEvents.JoinRoom, { streamId });
    return () => { offPaused(); offResumed(); offStarted(); };
  }, [streamId, coreConnected, connectionEpoch, on, emit]);
  return paused;
}
