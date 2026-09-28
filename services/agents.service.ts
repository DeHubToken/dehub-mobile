/**
 * AI agents — the calls behind web's /app/agents (src/pages/app/AgentsPage.tsx).
 *
 * Agents are listed through the `get_my_agents` RPC, not a table read: the
 * api_key column is not selectable by client roles, because agents are publicly
 * listable and a readable key column would be a public key dump. The RPC only
 * returns the caller's own rows.
 *
 * Creating goes through dehub-mcp's plain REST route. The function is a
 * Streamable HTTP MCP server, so a JSON-RPC envelope posted at its root comes
 * back 406 and no agent is created.
 */
import env from "../config/env";
import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";

export interface AIAgent {
  id: string;
  name: string;
  description: string;
  api_key: string;
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
}): Promise<{ agent?: { id: string } }> {
  const response = await fetch(`${MCP_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      owner_wallet_address: input.walletAddress,
    }),
  });
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
