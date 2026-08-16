import React, { createContext, useContext, useEffect, type PropsWithChildren } from "react";
import { useStages as useStagesImpl } from "../hooks/useStages";
import type { UseStagesReturn } from "../hooks/useStages";

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
  useEffect(() => {
    openStageModalImpl = stages.openModal;
    return () => {
      openStageModalImpl = null;
    };
  }, [stages.openModal]);
  return <StageContext.Provider value={stages}>{children}</StageContext.Provider>;
};

export const useStages = (): UseStagesReturn => {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStages must be used within a StageProvider");
  return ctx;
};
