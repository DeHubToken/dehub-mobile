/**
 * AI agents — the calls behind web's /app/agents (src/pages/app/AgentsPage.tsx).
 *
 * Agents are listed through the `get_my_agents` RPC, not a table read: the
 * api_key column is not selectable by client roles, because agents are publicly
 * listable and a readable key column would be a public key dump. The RPC only
 * returns the caller's own rows, and fills api_key only for a request carrying a
 * signed wallet session: the bare x-wallet-address header anyone can set lists
 * agents but never reveals their keys.
 *
 * Creating goes through dehub-mcp's plain REST route. The function is a
 * Streamable HTTP MCP server, so a JSON-RPC envelope posted at its root comes
 * back 406 and no agent is created. It needs the owner's DeHub token: the agent
 * is filed under the wallet that token belongs to.
 */
import env from "../config/env";
import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { getAuthToken } from "../libs/auth.utils";
import { tokenRefreshManager } from "../libs/token-refresh";

/** Registration failures the screen words itself instead of showing the server's text. */
export const AGENT_SIGN_IN_REQUIRED = "AGENT_SIGN_IN_REQUIRED";
export const AGENT_AUTH_UNAVAILABLE = "AGENT_AUTH_UNAVAILABLE";

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  /** Null unless the request carried a signed wallet session. */
  api_key: string | null;
  owner_wallet_address: string;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
}

export const MCP_BASE = `${env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/dehub-mcp`;

/**
 * Each agent gets its own connector URL with the key in the path. Hosted
 * assistants' custom connectors only accept a URL and cannot attach the
 * x-dehub-api-key header, so this is how an agent's write tools are reached.
 */
export const agentConnectorUrl = (apiKey: string) => `${MCP_BASE}/k/${apiKey}`;

export async function fetchMyAgents(walletAddress: string): Promise<AIAgent[]> {
  const { data, error } = await withWalletHeader(
    (supabase as any).rpc("get_my_agents"),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as AIAgent[];
}

export async function registerAgent(input: {
  name: string;
  description: string;
  walletAddress: string;
}): Promise<{ agent?: { id: string; api_key?: string } }> {
  // The endpoint used to take the owner wallet from the body on trust, so
  // anyone could file agents under someone else's wallet. The wallet is still
  // sent so a token for a different wallet than the one on screen is refused
  // instead of filing the agent somewhere this list cannot see.
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error(AGENT_SIGN_IN_REQUIRED);

  const response = await fetch(`${MCP_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dehub-token": token },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      owner_wallet_address: input.walletAddress,
    }),
  });
  if (response.status === 401 || response.status === 403) throw new Error(AGENT_SIGN_IN_REQUIRED);
  if (response.status === 503) throw new Error(AGENT_AUTH_UNAVAILABLE);
  const data = await response.json().catch(() => ({}));
  // The endpoint explains name clashes and per-wallet limits; passing that
  // through beats a generic failure the user cannot act on.
  if (!response.ok) throw new Error(data?.error ?? "Registration failed");
  return data;
}

export async function deleteAgent(agentId: string, walletAddress: string): Promise<void> {
  const { error } = await withWalletHeader(
    supabase.from("ai_agents").delete().eq("id", agentId),
    walletAddress,
  );
  if (error) throw error;
}
