import { useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import {
  ONLINE_PRESENCE_TOPIC,
  getShowOnline,
  onlineFromChannel,
  publishOnline,
} from "../libs/online-presence";

/**
 * Joins the shared presence channel while signed in so the green dots on
 * Messages can be read, and tracks this account only while the switch is on
 * and the app is in the foreground — backgrounding untracks straight away
 * rather than leaving a dot lit until the OS kills the socket.
 */
export function useOnlinePresence() {
  const user = useUser() as any;
  const me = ((user?.walletAddress || user?.address || "") as string).toLowerCase() || null;
  const showOnline = useMemo(() => {
    const raw = user?.customs;
    let customs = raw;
    if (typeof raw === "string") {
      try { customs = JSON.parse(raw); } catch { customs = null; }
    }
    return getShowOnline(customs);
  }, [user?.customs]);
  const [active, setActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => setActive(s === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!me || !active) return;
    const channel = supabase.channel(ONLINE_PRESENCE_TOPIC, { config: { presence: { key: me } } });
    channel
      .on("presence", { event: "sync" }, () => publishOnline(onlineFromChannel(channel)))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (showOnline) void channel.track({ at: new Date().toISOString() });
      });
    return () => {
      void supabase.removeChannel(channel);
      publishOnline(new Set());
    };
  }, [me, showOnline, active]);
}
