import React, { createContext, useContext, type PropsWithChildren } from "react";
import { useStages as useStagesImpl } from "../hooks/useStages";
import type { UseStagesReturn } from "../hooks/useStages";

const StageContext = createContext<UseStagesReturn | null>(null);

export const StageProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const stages = useStagesImpl();
  return <StageContext.Provider value={stages}>{children}</StageContext.Provider>;
};

export const useStages = (): UseStagesReturn => {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStages must be used within a StageProvider");
  return ctx;
};
