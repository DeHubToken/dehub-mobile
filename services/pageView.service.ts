import { AppState } from "react-native";

import { getAnonViewerId } from "./anonView.service";
import { supabase } from "./supabase";

/**
 * Screen view tracking
 * ====================
 * Records which screens people actually reach, in batches, through the
 * `record_page_views` RPC shared with the web app (dehubweb migration
 * 20260914120000).
 *
 * Nothing recorded a navigation on either client before this, so route-level
 * questions — "how many people reach the buy screen, and from where" — had no
 * answer at all.
 *
 * Screen names are recorded as `/m/<screen>` so mobile traffic is separable
 * from web's `/app/...` paths in the same table. Nothing else about the route
 * is sent: params carry post ids, wallet addresses and usernames.
 *
 * Failures are swallowed. Analytics must never be visible to the user, and a
 * dropped batch costs a count, not a session.
 */

const MAX_BATCH = 50;
const FLUSH_INTERVAL_MS = 15_000;

interface QueuedView {
  path: string;
  prevPath?: string;
}

const QUEUE: QueuedView[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let lastPath: string | null = null;
let currentAddress: string | null = null;

// The generated Supabase types do not carry record_page_views.
const db = supabase as unknown as {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
};

/** Attribution for subsequent batches. Null while signed out. */
export function setScreenViewAddress(address: string | null | undefined): void {
  currentAddress = address ?? null;
}

async function flush(): Promise<void> {
  if (QUEUE.length === 0) return;
  const batch = QUEUE.splice(0, MAX_BATCH);
  try {
    await db.rpc("record_page_views", {
      p_events: batch,
      p_viewer_id: await getAnonViewerId(),
      p_address: currentAddress,
    });
  } catch {
    /* never surfaced */
  }
}

function ensureTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
  // Backgrounding is this platform's page-hide: an app the user swipes away
  // never runs the timer again, so the last screens they saw ride out here.
  AppState.addEventListener("change", (state) => {
    if (state !== "active") void flush();
  });
}

/** Record one screen change. Repeats of the same screen are not a second visit. */
export function recordScreenView(routeName: string | undefined): void {
  if (!routeName) return;

  const path = `/m/${routeName}`.replace(/[^A-Za-z0-9/:_.-]/g, "").toLowerCase();
  if (path === lastPath) return;

  const prevPath = lastPath;
  lastPath = path;

  QUEUE.push({ path, ...(prevPath ? { prevPath } : {}) });

  ensureTimer();
  if (QUEUE.length >= MAX_BATCH) void flush();
}
