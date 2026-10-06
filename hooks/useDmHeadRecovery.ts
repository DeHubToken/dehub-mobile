import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useWebSocketApi } from '../context/WebSocketContext';
import { useIsScreenFocused } from './useFocusedInterval';

/** One bounded recovery on open, focus, foreground or DM reconnect. */
export function useDmHeadRecovery(
  refresh: (isCurrent: () => boolean) => Promise<void>,
  enabled: boolean,
): void {
  const focused = useIsScreenFocused();
  const { onDmReconnect } = useWebSocketApi();
  useEffect(() => {
    if (!enabled || !focused) return;
    let live = true;
    let pending = false;
    const current = () => live && AppState.currentState === 'active';
    const recover = () => {
      if (!current() || pending) return;
      pending = true;
      void refresh(current).catch(() => {}).finally(() => { pending = false; });
    };
    const disconnect = onDmReconnect(recover);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') recover();
    });
    recover();
    return () => {
      live = false;
      disconnect();
      foreground.remove();
    };
  }, [refresh, enabled, focused, onDmReconnect]);
}
