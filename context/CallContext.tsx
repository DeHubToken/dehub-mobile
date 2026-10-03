import React, { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from "react";
import { useCall as useCallImpl, type UseCallReturn } from "../hooks/useCall";
import { trackVisualActivity, visualActivity } from "../libs/visualActivity";

const CallContext = createContext<UseCallReturn | null>(null);
type CallActions = Pick<UseCallReturn, "setCallMessageHandler">;
const CallActionsContext = createContext<CallActions | null>(null);

export const CallProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const call = useCallImpl();
  const actions = useMemo(() => ({ setCallMessageHandler: call.setCallMessageHandler }), [call.setCallMessageHandler]);
  useEffect(trackVisualActivity, []);
  useEffect(() => {
    const busy = !!call.currentCall;
    visualActivity.setCall(busy, busy && !call.isMinimized);
  }, [call.currentCall, call.isMinimized]);
  return (
    <CallActionsContext.Provider value={actions}>
      <CallContext.Provider value={call}>{children}</CallContext.Provider>
    </CallActionsContext.Provider>
  );
};
export const useCall = (): UseCallReturn => {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCall must be used within a CallProvider");
  return context;
};
export const useCallActions = (): CallActions => {
  const context = useContext(CallActionsContext);
  if (!context) throw new Error("useCallActions must be used within a CallProvider");
  return context;
};
