import React, { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { useStages as useStagesImpl } from "../hooks/useStages";
import type { UseStagesReturn } from "../hooks/useStages";
import { supabase } from "../services/supabase";
import { ScreenNames } from "../navigation/ScreenNames";
import { setStageDeepLinkHandler } from "../libs/deeplink.events";
import { createLogger } from "../libs/logger";
import { useStageAlerts } from "../hooks/useStageAlerts";
import { setLiveStageHosts } from "../hooks/useIsUserLive";

const log = createLogger("StageDeepLink");

const StageContext = createContext<UseStagesReturn | null>(null);

export const StageProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const stages = useStagesImpl();
  const { openModal, joinSpace, guestListenSpace } = stages;

  // Mounted here because it has to be app-wide and outlive any stage screen:
  // the point is being told about a stage you are NOT currently looking at.
  // It raises alerts through the same deep-link bus registered below, so the
  // toast's action lands in exactly the same place an invite link does.
  useStageAlerts();

  // Hosts of live stages get the live ripple on their avatar everywhere.
  // Handed to a store rather than read from this context, which changes far
  // too often for every avatar on screen to subscribe to it.
  const { liveSpaces } = stages;
  useEffect(() => {
    setLiveStageHosts(
      liveSpaces.map((space) => ({ address: space.host_wallet_address, username: space.host_username, id: space.id })),
    );
  }, [liveSpaces]);

  /**
   * Open whatever a stage invite link points at.
   *
   * Registered here rather than in a component so nothing has to subscribe to
   * the context to receive a link: the context value is one object that changes
   * on every floating reaction, every participant update and every poll.
   *
   * The hub opens first and unconditionally: joining can only succeed for a
   * stage that is actually live, and the hub carries the upcoming and recorded
   * shelves, which is the right landing spot both for an announcement whose
   * host has not started it and for a room that has already ended. Same
   * ordering the in-app link cards use, so a stage link behaves identically
   * whether it arrives from a DM or from the operating system.
   */
  useEffect(() => {
    setStageDeepLinkHandler((link) => {
      void (async () => {
        try {
          // Look the row up first: an ended stage has its own page, and the
          // hub is only the landing spot for one that is live or upcoming.
          const query = supabase.from("audio_spaces").select("id,status");
          const { data } = await (link.id
            ? query.eq("id", link.id)
            : query.eq("short_id", link.shortId as number)
          ).maybeSingle();
          const row = data as { id?: string; status?: string } | null;
          const id = link.id ?? row?.id;
          if (row?.status === "ended" && id) {
            const { navigationRef } = require("../App");
            if (navigationRef.isReady()) {
              navigationRef.navigate(ScreenNames.StageRecording as never, { spaceId: id } as never);
              return;
            }
          }
          openModal("browse");
          if (!id) return;
          // A signed-in wallet can hold a seat; anyone else still gets to
          // listen, matching web's guest-listen invite link (no account, no
          // participant row). joinSpace itself refuses when signed out.
          if ((await joinSpace(id)) || (await guestListenSpace(id))) openModal("live");
        } catch (err) {
          log.error("Failed to open stage from deep link:", err);
          openModal("browse");
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
