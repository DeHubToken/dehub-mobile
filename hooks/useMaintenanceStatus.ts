import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { readMaintenanceStatus, type MaintenanceStatus } from '../libs/maintenance-status';

export function useMaintenanceStatus() {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(false);
  const pending = useRef<Promise<MaintenanceStatus | null> | null>(null);
  const check = useCallback(() => {
    if (pending.current) return pending.current;
    setChecking(true);
    pending.current = readMaintenanceStatus().then(status => {
      if (active.current) {
        if (status) setEnabled(status.enabled);
        setFailed(status === null);
        setChecking(false);
      }
      pending.current = null;
      return status;
    });
    return pending.current;
  }, []);
  useEffect(() => {
    active.current = true;
    void check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { active.current = false; subscription.remove(); };
  }, [check]);
  return { enabled, checking, failed, check };
}
