import React, { PropsWithChildren } from 'react';

// Nothing in the app reads a Livepeer client from context: stream status goes
// through the livepeer-stream-status edge function (services/livepeer.service)
// and playback is plain HLS/WebRTC. The provider stays as a passthrough so the
// navigator's wrapping keeps working, but no Livepeer API key ships in the app.
export const LivepeerProvider: React.FC<PropsWithChildren> = ({ children }) => <>{children}</>;
