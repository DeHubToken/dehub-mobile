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
import { ensureWalletSession } from "../libs/wallet-session";
import { translateCopy as _translateCopy } from '../i18n/copy';

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
  if (!await ensureWalletSession(walletAddress)) throw new Error(AGENT_SIGN_IN_REQUIRED);
  const { data, error } = await withWalletHeader(
    (supabase as any).rpc("get_my_agents"),
    walletAddress,
  );
  if (error) throw error;
  return (data ?? []) as AIAgent[];
}

export async function fetchAgentAllowance(): Promise<{ limit: number; badge: string | null }> {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error(AGENT_SIGN_IN_REQUIRED);
  const response = await fetch(`${MCP_BASE}/limits`, { headers: { "x-dehub-token": token } });
  if (!response.ok) throw new Error(_translateCopy("copy.19fc21fc40d9", { defaultValue: "Agent allowance is unavailable." }));
  return response.json();
}

export async function registerAgent(input: {
  name: string;
  displayName: string;
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
      display_name: input.displayName,
      description: input.description,
      owner_wallet_address: input.walletAddress,
    }),
  });
  if (response.status === 401 || response.status === 403) throw new Error(AGENT_SIGN_IN_REQUIRED);
  if (response.status === 503) throw new Error(AGENT_AUTH_UNAVAILABLE);
  const data = await response.json().catch(() => ({}));
  // The endpoint explains name clashes and per-wallet limits; passing that
  // through beats a generic failure the user cannot act on.
  if (!response.ok) throw new Error(data?.error ?? _translateCopy("copy.d40e3b08ef50", { defaultValue: "Registration failed" }));
  return data;
}

export async function deleteAgent(agentId: string, walletAddress: string): Promise<void> {
  if (!await ensureWalletSession(walletAddress)) throw new Error(AGENT_SIGN_IN_REQUIRED);
  const { error } = await withWalletHeader(
    supabase.from("ai_agents").delete().eq("id", agentId),
    walletAddress,
  );
  if (error) throw error;
}

export interface AgentTask {
  id: string; agent_id: string; prompt: string; status: string;
  swarm_id: string | null; swarm_index: number | null; swarm_size: number | null; swarm_mode?: 'shared' | 'each';
  plan: { summary: string; interval_minutes: number | null };
  completed_actions: number; next_run_at: string; needs_review: boolean; message: string | null;
}
export interface AgentTaskAction {
  id: string; tool: string; target: string; status: string; created_at: string;
  result: { error?: string; hint?: string; content?: string; message?: string; post?: { token_id?: string | number; url?: string } } | null;
}
export async function agentTaskRequest<T>(wallet: string, body: Record<string, unknown> | FormData): Promise<T> {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error(AGENT_SIGN_IN_REQUIRED);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${MCP_BASE}/tasks`, {
      method: 'POST', headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'x-dehub-token': token, 'x-wallet-address': wallet },
      body: body instanceof FormData ? body : JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json().catch(() => { throw new Error(_translateCopy("copy.4eb5fa08a3c5", { defaultValue: "The task service returned an unreadable response ({{value1}}). Refresh tasks before retrying.", value1: response.status })); });
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : _translateCopy("copy.9ff2df0a6bb4", { defaultValue: "The task request failed ({{value1}}). Refresh tasks before retrying.", value1: response.status }));
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(_translateCopy("copy.60f7d7960fb8", { defaultValue: "The task request timed out. Refresh tasks before retrying." }));
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
