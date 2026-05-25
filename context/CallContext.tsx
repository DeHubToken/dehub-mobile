import React, { createContext, useContext, type PropsWithChildren } from "react";
import { useCall as useCallImpl } from "../hooks/useCall";
import type { UseCallReturn } from "../hooks/useCall";

const CallContext = createContext<UseCallReturn | null>(null);

export const CallProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const call = useCallImpl();
  return <CallContext.Provider value={call}>{children}</CallContext.Provider>;
};

export const useCall = (): UseCallReturn => {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
};
