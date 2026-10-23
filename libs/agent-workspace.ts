export interface AgentSettings {
  mode: 'autonomous' | 'approval' | 'draft';
  permissions: string[]; voice: string; knowledge: string; blocked_topics: string[];
  news_enabled: boolean; news_topics: string[];
  alert_webhook: string;
}
export interface GrowthReport { followers: number; following: number; captured_at: string; previous_at: string | null; follower_change: number | null }
export const PERMISSIONS = [
  ['dehub_post_create', 'Publish posts'], ['dehub_comment', 'Reply and comment'],
  ['dehub_vote', 'React to posts'], ['dehub_follow', 'Follow accounts'], ['dehub_update_profile', 'Edit profile'],
  ['dehub_stream_timeout', 'Moderate stream chat'],
] as const;
export const NEWS_TOPICS = ['world', 'technology', 'culture', 'sport', 'science'];
export const BUILDER_ACTIONS = ['post', 'news', 'reply', 'curate'] as const;
export type BuilderAction = typeof BUILDER_ACTIONS[number];
export function buildAgentPrompt(action: BuilderAction, topic: string, cadence: string): string {
  const subject = topic.trim().replace(/[\r\n]+/g, ' ').slice(0, 500);
  if (!subject) return '';
  if (action === 'reply') return `Reply to every post in the last 24 hours. Reply style: ${subject}`;
  if (action === 'curate') return `Like up to 3 recent posts about ${subject}${cadence === 'once' ? ' once' : ' once per day'}.`;
  return `Post ${cadence === 'once' ? 'once' : cadence === 'daily' ? 'once per day' : 'twice per day'} about ${action === 'news' ? 'current news and real-world events related to ' : ''}${subject}.`;
}
export interface WorkspaceReceipt {
  id: string; agent_id: string; tool: string; arguments: Record<string, unknown>;
  status: string; result: { error?: string; message?: string } | null; created_at: string;
  reversal?: string | null; rollback_status?: string | null; alert_delivery?: string | null;
}
export interface WorkspaceOverview {
  agents: { id: string; name: string; is_active: boolean }[];
  tasks: { id: string; agent_id: string; status: string; next_run_at: string; message: string | null }[];
  receipts: WorkspaceReceipt[]; alerts: { id: string; message: string }[];
  templates: { id: string; name: string; prompt: string; published?: boolean; runs?: number; completed?: number; failed?: number; evaluation?: { checked_at?: string; tools?: string[] } }[];
}
export interface PlanPreview {
  draft?: string | null;
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

