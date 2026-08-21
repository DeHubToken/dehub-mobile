import React, { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { useStages as useStagesImpl } from "../hooks/useStages";
import type { UseStagesReturn } from "../hooks/useStages";
import { supabase } from "../services/supabase";
import { setStageDeepLinkHandler } from "../libs/deeplink.events";
import { createLogger } from "../libs/logger";
import { useStageAlerts } from "../hooks/useStageAlerts";

const log = createLogger("StageDeepLink");

const StageContext = createContext<UseStagesReturn | null>(null);

type StageModalView = "browse" | "create" | "live";

let openStageModalImpl: ((view?: StageModalView) => void) | null = null;

/**
 * Imperative opener, mirroring web's `openStageModal` export.
 *
 * The nav pill needs to open Stages, but it must not *subscribe* to stage
 * state: the context value is one object that changes on every floating
 * reaction (300ms cooldown), every participant update and every poll, and a
 * `useStages()` in the tab bar would re-render it on all of them, on every
 * screen in the app. The provider parks its opener here instead.
 */
export const openStageModal = (view: StageModalView = "browse") => {
  openStageModalImpl?.(view);
};

export const StageProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const stages = useStagesImpl();
  const { openModal, joinSpace, guestListenSpace } = stages;

  // Mounted here because it has to be app-wide and outlive any stage screen:
  // the point is being told about a stage you are NOT currently looking at.
  // It raises alerts through the same deep-link bus registered below, so the
  // toast's action lands in exactly the same place an invite link does.
  useStageAlerts();

  useEffect(() => {
    openStageModalImpl = openModal;
    return () => {
      openStageModalImpl = null;
    };
  }, [openModal]);

  /**
   * Open whatever a stage invite link points at.
   *
   * Registered here rather than in a component so nothing has to subscribe to
   * the context to receive a link — same reasoning as openStageModal above.
   *
   * Browse opens first and unconditionally: joining can only succeed for a
   * stage that is actually live, and the browse list carries the upcoming
   * shelf, which is the right landing spot both for an announcement whose host
   * has not started it and for a room that has already ended. Same ordering
   * the in-app link cards use, so a stage link behaves identically whether it
   * arrives from a DM or from the operating system.
   */
  useEffect(() => {
    setStageDeepLinkHandler((link) => {
      void (async () => {
        openModal("browse");
        try {
          let id = link.id;
          if (!id && link.shortId != null) {
            // A /stages/<n> link carries no uuid, and joinSpace keys on one.
            const { data } = await supabase
              .from("audio_spaces")
              .select("id")
              .eq("short_id", link.shortId)
              .maybeSingle();
            id = (data as { id?: string } | null)?.id ?? undefined;
          }
          if (!id) return;
          // A signed-in wallet can hold a seat; anyone else still gets to
          // listen, matching web's guest-listen invite link (no account, no
          // participant row). joinSpace itself refuses when signed out.
          if ((await joinSpace(id)) || (await guestListenSpace(id))) openModal("live");
        } catch (err) {
          log.error("Failed to open stage from deep link:", err);
        }
      })();
    });
    return () => setStageDeepLinkHandler(null);
  }, [openModal, joinSpace, guestListenSpace]);

  return <StageContext.Provider value={stages}>{children}</StageContext.Provider>;
};

export const useStages = (): UseStagesReturn => {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStages must be used within a StageProvider");
  return ctx;
};
