export interface AgentSettings {
  mode: 'autonomous' | 'approval' | 'draft';
  permissions: string[]; voice: string; knowledge: string; blocked_topics: string[];
  news_enabled: boolean; news_topics: string[];
}
export const PERMISSIONS = [
  ['dehub_post_create', 'Publish posts'], ['dehub_comment', 'Reply and comment'],
  ['dehub_vote', 'React to posts'], ['dehub_follow', 'Follow accounts'], ['dehub_update_profile', 'Edit profile'],
] as const;
export const NEWS_TOPICS = ['world', 'technology', 'culture', 'sport', 'science'];
export interface WorkspaceReceipt {
  id: string; agent_id: string; tool: string; arguments: Record<string, unknown>;
  status: string; result: { error?: string; message?: string } | null; created_at: string;
}
export interface WorkspaceOverview {
  agents: { id: string; name: string; is_active: boolean }[];
  tasks: { id: string; agent_id: string; status: string; next_run_at: string; message: string | null }[];
  receipts: WorkspaceReceipt[]; alerts: { id: string; message: string }[];
  templates: { id: string; name: string; prompt: string; published?: boolean }[];
}
export interface PlanPreview {
  plan: { summary: string; interval_minutes: number | null };
  checks: { tool: string; audience: string; generated: boolean; permission: string | null }[];
  mode: string; message: string;
}
export function workspaceCounts(data?: WorkspaceOverview) {
  return {
    active: data?.agents.filter(agent => agent.is_active).length ?? 0,
    scheduled: data?.tasks.filter(task => ['queued', 'running'].includes(task.status)).length ?? 0,
    pending: data?.receipts.filter(receipt => ['draft', 'approval'].includes(receipt.status)).length ?? 0,
    succeeded: data?.receipts.filter(receipt => receipt.status === 'succeeded').length ?? 0,
  };
}

