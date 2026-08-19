/**
 * Stage alerts (mobile) — "starting soon" and "it's live", as they happen
 * =======================================================================
 * The server has been writing these notifications since dehubweb #264: a
 * trigger fans `stage_live` rows into `custom_notifications` when a host goes
 * live, and pg_cron writes `stage_reminder` rows ten minutes ahead of a
 * scheduled start. Web reads them. This app never has — its bell is paged
 * entirely from the DeHub API, and those rows live in Supabase — so a
 * mobile-only account was told nothing at all, in-app or otherwise.
 *
 * ── Why this watches the stages and not the notification rows ──
 *
 * The obvious build is to read `custom_notifications`. It returns nothing.
 * Realtime applies RLS, and that table's SELECT policy is
 * `lower(recipient_address) = get_request_wallet_address()` — a function that
 * reads a request header a websocket cannot send, so the subscription reports
 * itself SUBSCRIBED and never emits. `audio_spaces` and `stage_reminders` are
 * both `USING (true)`, so "did this stage just start" and "do I hold a
 * reminder" are both readable without it. Web's useStageAlerts made the same
 * choice for the same reason.
 *
 * ── Detecting the transition without OLD.status ──
 *
 * `audio_spaces` has REPLICA IDENTITY DEFAULT, so an UPDATE payload's `old`
 * carries the primary key and nothing else — scheduled → live is
 * indistinguishable from a listener_count bump by comparing statuses. What is
 * reliable is `started_at`, which startScheduledSpace stamps at the moment of
 * the flip, so "live AND started seconds ago AND not already announced"
 * identifies it and survives the duplicate events a reconnect replays.
 *
 * ── What this does NOT do ──
 *
 * Nothing here reaches a phone whose app is closed. Push registration goes
 * through the DeHub API, and these rows are Supabase-side, so background
 * delivery needs the API taught about stage events — server work, not client
 * work. This is the in-app half: if you are using the app, you are told.
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { emitStageDeepLink, type StageDeepLink } from "../libs/deeplink.events";
import { toastInfo, toastSuccess } from "../libs/toast";
import { stageLiveSentence, stageReminderSentence } from "../libs/stage-notifications";
import { createLogger } from "../libs/logger";
import type { AudioSpace } from "./useStages";

const log = createLogger("useStageAlerts");

/**
 * How fresh `started_at` has to be for a live row to count as "just started".
 * Generous enough to cover a slow trigger, a reconnect replaying the event and
 * a clock a little out of step; short enough that opening the app during a
 * stage that has been running an hour announces nothing.
 */
const JUST_STARTED_MS = 2 * 60 * 1000;

/** How far ahead of `scheduled_at` the "starting soon" alert fires. */
const STARTING_SOON_MS = 10 * 60 * 1000;

/**
 * How often the upcoming sweep runs while the app is in the foreground.
 *
 * The pre-start notification is written by a pg_cron pass that no realtime
 * event corresponds to, so this side has to look. A minute is the same
 * resolution the cron itself runs at, and the query is two indexed reads.
 */
const SWEEP_MS = 60_000;

export function useStageAlerts() {
  const { user } = useAuth();
  const walletAddress = (user?.walletAddress || user?.address || "").toLowerCase();

  /**
   * Alerts already raised, keyed by type + stage. Session-scoped on purpose: a
   * relaunch is a fresh start, and a stage that is still live when you come
   * back is no longer news.
   */
  const alertedRef = useRef<Set<string>>(new Set());

  const raise = useCallback(
    (args: { type: "stage_live" | "stage_reminder"; stage: AudioSpace; sentence: string }) => {
      const key = `${args.type}@${args.stage.id}`;
      if (alertedRef.current.has(key)) return;
      alertedRef.current.add(key);

      const link: StageDeepLink =
        args.stage.short_id != null ? { shortId: args.stage.short_id } : { id: args.stage.id };

      const open = () => emitStageDeepLink(link);
      const options = {
        duration: 12_000,
        actionLabel: args.type === "stage_live" ? "Listen in" : "View stage",
        onActionPress: open,
      };

      if (args.type === "stage_live") toastSuccess(args.sentence, options);
      else toastInfo(args.sentence, options);
    },
    [],
  );

  /** Do I hold a reminder for this stage? */
  const holdsReminder = useCallback(
    async (spaceId: string): Promise<boolean> => {
      const { data, error } = await supabase
        .from("stage_reminders")
        .select("id")
        .eq("space_id", spaceId)
        .eq("wallet_address", walletAddress)
        .maybeSingle();
      return !error && !!data;
    },
    [walletAddress],
  );

  // ── A stage just went live ────────────────────────────────────────────────
  useEffect(() => {
    if (!walletAddress) return;

    const announce = async (space: AudioSpace) => {
      if (space.status !== "live" || !space.id) return;

      const startedAt = space.started_at ? new Date(space.started_at).getTime() : 0;
      if (!startedAt || Date.now() - startedAt > JUST_STARTED_MS) return;

      // The host pressed the button; they do not need telling.
      if ((space.host_wallet_address || "").toLowerCase() === walletAddress) return;
      if (alertedRef.current.has(`stage_live@${space.id}`)) return;
      if (!(await holdsReminder(space.id))) return;

      const actorName = space.host_username ? `@${space.host_username}` : "Someone";
      raise({
        type: "stage_live",
        stage: space,
        sentence: stageLiveSentence(actorName, space.title),
      });
    };

    const channel = supabase
      .channel(`stage_alerts:${walletAddress}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "audio_spaces",
          // Realtime filters match the NEW row, so this drops every update that
          // lands a stage on scheduled or ended before it reaches the client.
          filter: "status=eq.live",
        },
        (payload: any) => {
          void announce(payload.new as AudioSpace).catch((err) =>
            log.error("Stage live alert failed:", err),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [walletAddress, holdsReminder, raise]);

  // ── A stage I am waiting on is about to start ─────────────────────────────
  //
  // No realtime event corresponds to the pre-start cron, so this one sweeps.
  // Foreground only: a timer that fires in the background would spend battery
  // to raise a toast nobody can see.
  useEffect(() => {
    if (!walletAddress) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const sweep = async () => {
      try {
        const { data: reminders, error } = await supabase
          .from("stage_reminders")
          .select("space_id")
          .eq("wallet_address", walletAddress);
        if (error || !reminders?.length) return;

        const ids = reminders
          .map((r: { space_id: string }) => r.space_id)
          .filter((id) => !alertedRef.current.has(`stage_reminder@${id}`));
        if (!ids.length) return;

        const { data: spaces } = await supabase
          .from("audio_spaces")
          .select("*")
          .in("id", ids)
          .eq("status", "scheduled")
          .lte("scheduled_at", new Date(Date.now() + STARTING_SOON_MS).toISOString())
          // Bounded below as well as above: without it every stage whose time
          // came and went unstarted would announce itself on the first sweep.
          .gte("scheduled_at", new Date(Date.now() - STARTING_SOON_MS).toISOString());

        for (const space of (spaces ?? []) as AudioSpace[]) {
          if ((space.host_wallet_address || "").toLowerCase() === walletAddress) continue;
          raise({
            type: "stage_reminder",
            stage: space,
            sentence: stageReminderSentence(space.title),
          });
        }
      } catch (err) {
        log.error("Stage reminder sweep failed:", err);
      }
    };

    const start = () => {
      if (timer) return;
      void sweep();
      timer = setInterval(() => void sweep(), SWEEP_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === "active") start();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [walletAddress, raise]);
}
