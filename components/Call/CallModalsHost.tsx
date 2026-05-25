import React from "react";
import IncomingCallModal from "./IncomingCallModal";
import VoiceCallModal from "./VoiceCallModal";
import VideoCallModal from "./VideoCallModal";

/**
 * Renders global call modals inside the CallProvider.
 * Does NOT render a MiniPlayer here — that lives in App.tsx
 * so it can overlay bottom tabs.
 */
const CallModalsHost: React.FC = () => {
  return (
    <>
      <IncomingCallModal />
      <VoiceCallModal />
      <VideoCallModal />
    </>
  );
};

export default CallModalsHost;
