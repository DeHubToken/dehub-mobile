import React, { useEffect, useState } from "react";
import { useCall } from "../../context/CallContext";
import { formatCallDuration } from "../../libs/callDuration";
import { visualActivity } from "../../libs/visualActivity";
import { useSyncExternalStore } from "react";

export function CallDuration({ fallback }: { fallback: string }) {
  const { callStartedAt } = useCall();
  // Android's call Modal takes focus from the activity without backgrounding
  // the app. Keep its clock running, but sleep when the app is inactive.
  const foreground = useSyncExternalStore(visualActivity.subscribe, visualActivity.isAppForeground, () => true);
  const [, tick] = useState(0);
  useEffect(() => {
    if (callStartedAt == null || !foreground) return;
    const interval = setInterval(() => tick(previous => previous + 1), 1000);
    return () => clearInterval(interval);
  }, [callStartedAt, foreground]);
  return <>{callStartedAt == null ? fallback : formatCallDuration(callStartedAt)}</>;
}

