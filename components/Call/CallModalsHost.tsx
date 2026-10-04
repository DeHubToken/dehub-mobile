import React from "react";
import { useCall } from "../../context/CallContext";
export default function CallModalsHost() {
  const { currentCall, isIncoming } = useCall();
  if (!currentCall) return null;
  const Incoming = isIncoming ? require('./IncomingCallModal').default : null;
  const Active = currentCall.call_type === 'video'
    ? require('./VideoCallModal').default : require('./VoiceCallModal').default;
  return <>{Incoming && <Incoming />}<Active /></>;
}
