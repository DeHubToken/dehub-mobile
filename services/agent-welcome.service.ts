import { apiClient } from '../libs/api.client';
import { translateCopy as _translateCopy } from '../i18n/copy';

/**
 * Agent welcomes (backend src/agent-welcome): a person's own agents follow
 * and/or message people who just joined. The server enforces every limit;
 * these only read and switch.
 */
export type AgentWelcome = {
  address: string; username: string; displayName: string; avatarImageUrl: string | null;
  follow: boolean; message: boolean; text: string; perDay: number;
  today: { follows: number; messages: number };
};
export type AgentWelcomeList = { limits: { maxPerDay: number; defaultPerDay: number; ownerMessagesPerDay: number; maxText: number }; agents: AgentWelcome[] };
export type AgentWelcomeEntry = {
  kind: 'follow' | 'message'; status: 'done' | 'skipped' | 'failed'; reason: string; content: string; at: string;
  target: { address: string; username: string | null; displayName: string | null; avatarImageUrl: string | null };
};

function unwrap<T>(response: any): T {
  if (response && response.status === false) throw new Error(response.error || response.message || _translateCopy("copy.cfce761befa8", { defaultValue: "Request failed" }));
  return (response?.result ?? response) as T;
}

export async function getAgentWelcomes(): Promise<AgentWelcomeList> {
  return unwrap(await apiClient.get('/agent-welcome', { isAuthRequired: true }));
}

export async function setAgentWelcome(agent: string, change: Partial<Pick<AgentWelcome, 'follow' | 'message' | 'text' | 'perDay'>>): Promise<AgentWelcome> {
  return unwrap(await apiClient.post(`/agent-welcome/${encodeURIComponent(agent)}`, change, { isAuthRequired: true }));
}

export async function getAgentWelcomeLog(agent: string): Promise<AgentWelcomeEntry[]> {
  return unwrap<{ entries: AgentWelcomeEntry[] }>(await apiClient.get(`/agent-welcome/${encodeURIComponent(agent)}/log`, { isAuthRequired: true })).entries ?? [];
}
