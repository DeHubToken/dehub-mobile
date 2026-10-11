export const canManageAgents = (wallet?: string | null) =>
  wallet?.toLowerCase() === '0x9324840523a5d17dd12a2f11a9472e5a199c1937';
