/** @maldoteth's wallet, plus his erased account's wallet: the team account. */
const AGENT_TEAM = ['0xec4e2c7417f781b35d830671f013b3b91f29ba64', '0x9324840523a5d17dd12a2f11a9472e5a199c1937'];

/** Anyone signed in can make and run their own agents. */
export const canManageAgents = (wallet?: string | null) => !!wallet;

/**
 * Group runs, "every post / every user" runs and the always-on Alive mode stay
 * with the team account; the agent server refuses them for everyone else.
 */
export const isAgentTeam = (wallet?: string | null) =>
  !!wallet && AGENT_TEAM.includes(wallet.toLowerCase());
