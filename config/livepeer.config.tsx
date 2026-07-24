import React, { PropsWithChildren } from 'react';
import { LivepeerConfig, createReactClient, studioProvider } from '@livepeer/react-native';
import env from './env';

// Minimal, eagerly-created client. Avoids dynamic wrapping complexity.
const LIVEPEER_API_KEY: string | undefined = (env as any)?.LIVEPEER_API_KEY;
if (!LIVEPEER_API_KEY) {
  console.warn('[Livepeer] LIVEPEER_API_KEY missing. Add it to your .env to enable authenticated streaming.');
}

// NOTE: Passing empty string if undefined to satisfy type, library should handle anonymous usage.
const livepeerClient = createReactClient({
  provider: studioProvider({ apiKey: LIVEPEER_API_KEY || '' }),
});

export const LivepeerProvider: React.FC<PropsWithChildren> = ({ children }) => (
  <LivepeerConfig client={livepeerClient}>{children}</LivepeerConfig>
);

export default livepeerClient;