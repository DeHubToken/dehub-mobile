import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import env from '../config/env';
import { useAuthState } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { acquireStreamViewer } from '../libs/stream-presence';
import { LivestreamEvents } from '../services/enums/livestream.enum';

/** Presence follows playback, visibility and the app's foreground state. */
export function useStreamPresence(streamId: string | undefined, watching: boolean) {
  const { isSignedIn } = useAuthState();
  const { emitAuthed, isCoreConnected, coreConnected, connectionEpoch } = useWebSocket();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!streamId || !watching || !foreground) return;
    if (isSignedIn) {
      if (!coreConnected) return;
      return acquireStreamViewer(emitAuthed, isCoreConnected, connectionEpoch, streamId);
    }
    // The shared application socket is only created for signed-in accounts.
    const socket = io((env.WEBSOCKET_URL || 'https://api.dehub.io').replace(/\/socket\.io\/?$/i, ''), {
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => socket.emit(LivestreamEvents.AnonJoinStream, { streamId }));
    return () => { socket.disconnect(); };
  }, [streamId, watching, foreground, isSignedIn, coreConnected, connectionEpoch, emitAuthed, isCoreConnected]);
}
