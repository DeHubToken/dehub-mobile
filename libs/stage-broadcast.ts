/**
 * Stage changes, as the database broadcasts them.
 *
 * A trigger on audio_spaces sends every insert, update and delete to the
 * private `stages` topic. This replaced a postgres_changes subscription per
 * open app, which on its own kept Realtime's change poller querying the
 * database twice a second around the clock.
 *
 * The payload keeps the postgres_changes shape — `eventType`, the full `new`
 * row — so handlers written for it carry over unchanged. `old` always carries
 * `status` now, so a stage going live can be told apart from a headcount tick.
 *
 * The stage lists and the live alert listen at the same time, and realtime-js
 * hands every caller of `channel("stages")` the same object — so one caller's
 * removeChannel would silence the other. Holders share one channel here, and
 * it closes when the last one leaves. A holder that arrives while that close
 * is still in flight waits for it: until the server acknowledges the leave,
 * `channel("stages")` would hand back the closing channel, and subscribing to
 * that does nothing.
 *
 * Broadcast has no backlog: anything sent while the app was not joined is
 * gone. `onJoin` fires on the first join and on every rejoin after a dropped
 * socket, and is where a holder that keeps state re-reads it.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../services/supabase";
import type { AudioSpace } from "../hooks/useStages";

export interface StageChange {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: AudioSpace | null;
  old: Pick<AudioSpace, "id" | "status"> | null;
}

interface Holder {
  onChange: (change: StageChange) => void;
  onJoin?: () => void;
}

const holders = new Set<Holder>();
let channel: RealtimeChannel | null = null;
let joined = false;
let leaving: Promise<unknown> | null = null;

function open() {
  const start = () => {
    if (channel || holders.size === 0) return;
    joined = false;
    const chan = supabase
      .channel("stages", { config: { private: true } })
      .on("broadcast", { event: "change" }, (message) => {
        const change = message.payload as StageChange | undefined;
        if (!change) return;
        for (const holder of [...holders]) holder.onChange(change);
      });
    channel = chan;
    chan.subscribe((status) => {
      if (channel !== chan) return;
      joined = status === "SUBSCRIBED";
      if (!joined) return;
      for (const holder of [...holders]) holder.onJoin?.();
    });
  };
  if (leaving) void leaving.then(start);
  else start();
}

export function watchStages(onChange: (change: StageChange) => void, onJoin?: () => void): () => void {
  const holder: Holder = { onChange, onJoin };
  holders.add(holder);
  if (!channel) open();
  else if (joined) onJoin?.();
  return () => {
    if (!holders.delete(holder) || holders.size > 0 || !channel) return;
    const chan = channel;
    channel = null;
    joined = false;
    const done: Promise<unknown> = supabase
      .removeChannel(chan)
      .catch(() => undefined)
      .finally(() => { if (leaving === done) leaving = null; });
    leaving = done;
  };
}
