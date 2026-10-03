import React, { useEffect, useState } from "react";
import { useCall } from "../../context/CallContext";
import { formatCallDuration } from "../../libs/callDuration";
import { visualActivity } from "../../libs/visualActivity";
import { useSyncExternalStore } from "react";

export function CallDuration({ fallback }: { fallback: string }) {
  const { callStartedAt } = useCall();
  // The call owns the screen, so its clock ignores call coverage but still
  // sleeps while a system call or another app owns the foreground.
  const foreground = useSyncExternalStore(visualActivity.subscribe, visualActivity.isForeground, () => true);
  const [, tick] = useState(0);
  useEffect(() => {
    if (callStartedAt == null || !foreground) return;
    const interval = setInterval(() => tick(previous => previous + 1), 1000);
    return () => clearInterval(interval);
  }, [callStartedAt, foreground]);
  return <>{callStartedAt == null ? fallback : formatCallDuration(callStartedAt)}</>;
}

