import env from "./env";

export const AGORA_APP_ID = env.AGORA_APP_ID;

/** Channel mode: Communication for 1:1 calls, LiveBroadcasting for stages */
export const AgoraMode = {
  Communication: 0,
  LiveBroadcasting: 1,
} as const;

/** Client role: 1 = host (broadcaster), 2 = audience (listener) */
export const AgoraClientRole = {
  Broadcaster: 1,
  Audience: 2,
} as const;

/** Call config */
export const CALL_CONFIG = {
  /** Channel name prefix for direct-message calls */
  channelPrefix: "dm-call",
  /** Ring timeout in ms (30 seconds) */
  ringTimeoutMs: 30_000,
  /** Incoming call auto-dismiss timeout in ms (45 seconds) */
  incomingTimeoutMs: 45_000,
} as const;

/** Stages config */
export const STAGE_CONFIG = {
  /** Channel name prefix for stages */
  channelPrefix: "stage",
} as const;
