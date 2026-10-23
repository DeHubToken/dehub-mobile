import { AgentModerationPanel } from './AgentModerationPanel';
import React, { useState } from 'react';
import { View, Text, TextInput, Switch, StyleSheet, Alert } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageSection, KitButton } from '../components/page/PageKit';
import { agentTaskRequest } from '../services/agents.service';
import type { GrowthReport } from '../libs/agent-workspace';
import { PERMISSIONS, NEWS_TOPICS, BUILDER_ACTIONS, buildAgentPrompt, workspaceCounts, type BuilderAction, type AgentSettings, type WorkspaceOverview, type PlanPreview } from '../libs/agent-workspace';

function Settings({ wallet, agentId }: { wallet: string; agentId: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AgentSettings | null>(null);
  const [open, setOpen] = useState(false);
  const settings = useQuery({ queryKey: ['agent-controls', wallet, agentId], queryFn: () => agentTaskRequest<{ settings: AgentSettings }>(wallet, { operation: 'workspace_settings', agent_id: agentId }) });
  const value = draft ?? settings.data?.settings;
  const save = useMutation({ mutationFn: () => agentTaskRequest(wallet, { operation: 'workspace_save_settings', agent_id: agentId, settings: value }), onSuccess: () => { void settings.refetch(); } });
  const change = (patch: Partial<AgentSettings>) => { if (value) setDraft({ ...value, ...patch }); save.reset(); };
  return <View style={styles.card}>
    <KitButton variant="quiet" label={t('agents.workspace.controls', 'Voice, permissions and news')} onPress={() => setOpen(!open)} />
    {open && value && <>
      <View style={styles.row}>{(['autonomous', 'approval', 'draft'] as const).map(mode => <KitButton key={mode} variant={value.mode === mode ? 'primary' : 'quiet'} label={t(`agents.workspace.${mode}`, { defaultValue: mode === 'autonomous' ? 'Autonomous' : mode === 'approval' ? 'Approve first' : 'Draft only' })} onPress={() => change({ mode })} />)}</View>
      <Text style={styles.muted}>{t('agents.workspace.scope', 'These controls apply to scheduled tasks, autonomous life and connected assistants. Drafts remain private until you approve them.')}</Text>
      {PERMISSIONS.map(([tool, label]) => <View key={tool} style={styles.row}><Switch accessibilityLabel={t(`agents.workspace.${tool}`, label)} value={value.permissions.includes(tool)} onValueChange={on => change({ permissions: on ? [...value.permissions, tool] : value.permissions.filter(item => item !== tool) })} /><Text style={styles.text}>{t(`agents.workspace.${tool}`, label)}</Text></View>)}
      <Text style={styles.text}>{t('agents.workspace.voice', 'Voice and tone')}</Text><TextInput accessibilityLabel={t('agents.workspace.voice', 'Voice and tone')} style={styles.input} value={value.voice} maxLength={1000} multiline onChangeText={voice => change({ voice })} />
      <Text style={styles.text}>{t('agents.workspace.knowledge', 'Reference material')}</Text><TextInput accessibilityLabel={t('agents.workspace.knowledge', 'Reference material')} style={styles.input} value={value.knowledge} maxLength={12000} multiline onChangeText={knowledge => change({ knowledge })} />
      <Text style={styles.text}>{t('agents.workspace.blocked', 'Blocked topics, separated by commas')}</Text><TextInput accessibilityLabel={t('agents.workspace.blocked', 'Blocked topics, separated by commas')} style={styles.input} value={value.blocked_topics.join(', ')} onChangeText={text => change({ blocked_topics: text.split(',').map(item => item.trim()).filter(Boolean) })} />
      <View style={styles.row}><Switch accessibilityLabel={t('agents.workspace.liveNews', 'React to current news during autonomous life')} value={value.news_enabled} onValueChange={news_enabled => change({ news_enabled })} /><Text style={[styles.text, { flex: 1 }]}>{t('agents.workspace.liveNews', 'React to current news during autonomous life')}</Text></View>
      <View style={styles.row}>{NEWS_TOPICS.map(topic => <KitButton key={topic} variant={value.news_topics.includes(topic) ? 'primary' : 'quiet'} label={t(`agents.workspace.news.${topic}`, topic)} onPress={() => change({ news_topics: value.news_topics.includes(topic) ? value.news_topics.length > 1 ? value.news_topics.filter(item => item !== topic) : value.news_topics : value.news_topics.length < 3 ? [...value.news_topics, topic] : value.news_topics })} />)}</View>
      <Text style={styles.muted}>{t('agents.workspace.newsHelp', 'Choose up to three topics. Publisher reports from the last 24 hours are cached for 15 minutes. News reactions include a source link; unavailable or stale news is skipped.')}</Text>
      <Text style={styles.text}>{t('agents.workspace.webhook', "Discord alert webhook (optional)")}</Text><TextInput accessibilityLabel="Discord alert webhook" secureTextEntry autoCapitalize="none" style={styles.input} value={value.alert_webhook} maxLength={300} onChangeText={alert_webhook => change({ alert_webhook })} />
      <Text style={styles.muted}>{t('agents.workspace.webhookHelp', "Approval requests and action failures send a generic alert, at most once per hour. No draft text or wallet details are sent. Leave blank to disable; delivery results appear in the audit log.")}</Text>
      <KitButton label={t('common.save', 'Save')} disabled={save.isPending} onPress={() => save.mutate()} />
      {save.isSuccess && <Text accessibilityRole="alert" style={styles.text}>{t('agents.workspace.saved', 'Settings saved.')}</Text>}
    </>}
    {(save.error || settings.error) && <Text accessibilityRole="alert" style={styles.error}>{(save.error || settings.error)?.message}</Text>}
  </View>;
}

export function AgentWorkspacePanel({ wallet }: { wallet: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [prompt, setPrompt] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [published, setPublished] = useState(false);
  const [requestId, setRequestId] = useState(randomUUID);
  const [history, setHistory] = useState(false);
  const [filter, setFilter] = useState('all');
  const [action, setAction] = useState<BuilderAction>('post');
  const [topic, setTopic] = useState('');
  const [cadence, setCadence] = useState('daily');
  const overview = useQuery({ queryKey: ['agent-workspace', wallet], queryFn: () => agentTaskRequest<WorkspaceOverview>(wallet, { operation: 'workspace_overview' }) });
  const agentId = overview.data?.agents.some(agent => agent.id === selected) ? selected : overview.data?.agents[0]?.id;
  const counts = workspaceCounts(overview.data);
  const report = useMutation({ mutationFn: () => agentTaskRequest<GrowthReport>(wallet, { operation: 'workspace_report', agent_id: agentId }) });
  const refresh = () => { void overview.refetch(); client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); };
  const preview = useMutation({ mutationFn: () => agentTaskRequest<PlanPreview>(wallet, { operation: 'workspace_preview', agent_id: agentId, prompt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  const run = useMutation({ mutationFn: () => agentTaskRequest(wallet, { operation: 'create', agent_id: agentId, prompt, template_id: templateId, request_id: requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }), onSuccess: refresh });
  const template = useMutation({ mutationFn: () => agentTaskRequest(wallet, { operation: 'workspace_save_template', agent_id: agentId, name, prompt, published }), onSuccess: refresh });
  const review = useMutation({ mutationFn: ({ id, agent, approve }: { id: string; agent: string; approve: boolean }) => agentTaskRequest(wallet, { operation: approve ? 'workspace_approve' : 'workspace_reject', agent_id: agent, receipt_id: id }), onSettled: refresh });
  const reverse = useMutation({ mutationFn: ({ id, agent }: { id: string; agent: string }) => agentTaskRequest(wallet, { operation: 'workspace_reverse', agent_id: agent, receipt_id: id }), onSettled: refresh });
  const changePrompt = (text: string) => { setPrompt(text); setTemplateId(null); setRequestId(randomUUID()); preview.reset(); run.reset(); template.reset(); };
  const receipts = overview.data?.receipts.filter(receipt => (filter === 'all' || receipt.status === filter) && (!selected || receipt.agent_id === selected)) ?? [];
  return <PageSection><View style={styles.panel}>
    <Text style={styles.title}>{t('agents.workspace.title', 'Agent workspace')}</Text>
    <KitButton variant="quiet" label={t('agents.tasks.refresh')} disabled={overview.isFetching} onPress={refresh} />
    <View style={styles.row}>{Object.entries(counts).map(([key, count]) => <View key={key} style={styles.metric}><Text style={styles.title}>{count}</Text><Text style={styles.muted}>{t(`agents.workspace.count.${key}`, { defaultValue: key === 'pending' ? 'Drafts to review' : key === 'succeeded' ? 'Recent successes' : key === 'scheduled' ? 'Scheduled tasks' : 'Active agents' })}</Text></View>)}</View>
    <Text style={styles.muted}>{t('agents.workspace.sample', 'Activity and alerts cover the latest 100 actions and 200 tasks. Counts are not lifetime totals or billing usage.')}</Text>
    {overview.data?.alerts.map(alert => <Text key={alert.id} accessibilityRole="alert" style={styles.error}>{alert.message}</Text>)}
    <View style={styles.row}>{overview.data?.agents.map(agent => <KitButton key={agent.id} label={`@${agent.name}`} variant={agentId === agent.id ? 'primary' : 'quiet'} onPress={() => { setSelected(agent.id); preview.reset(); run.reset(); report.reset(); setRequestId(randomUUID()); }} />)}</View>
    {agentId && <Settings key={agentId} wallet={wallet} agentId={agentId} />}
    {agentId && <AgentModerationPanel key={`moderate-${agentId}`} wallet={wallet} agentId={agentId} refresh={refresh} />}
    <KitButton variant="quiet" label={t('agents.workspace.growth', 'Capture growth report')} disabled={!agentId || report.isPending} onPress={() => report.mutate()} />
    {report.data && <Text style={styles.text}>{t('agents.workspace.growthResult', { defaultValue: '{{followers}} followers · {{following}} following', ...report.data })} · {report.data.follower_change === null ? t('agents.workspace.baseline', 'First snapshot; capture another later to compare.') : t('agents.workspace.growthChange', { defaultValue: 'Follower change: {{count}} since {{time}}', count: report.data.follower_change, time: new Date(report.data.previous_at!).toLocaleString() })}</Text>}
    {report.error && <Text accessibilityRole="alert" style={styles.error}>{report.error.message}</Text>}
    <Text style={styles.title}>{t('agents.workspace.library', 'Templates and task builder')}</Text>
    <View style={styles.row}>{BUILDER_ACTIONS.map(item => <KitButton key={item} variant={action === item ? 'primary' : 'quiet'} label={t(`agents.workspace.builder.${item}`, { defaultValue: item === 'news' ? 'React to news' : item === 'reply' ? 'Reply to recent posts' : item === 'curate' ? 'Like relevant posts' : 'Write a post' })} onPress={() => setAction(item)} />)}</View>
    <TextInput accessibilityLabel={t('agents.workspace.subject', 'Topic or reply style')} placeholder={t('agents.workspace.subject', 'Topic or reply style')} placeholderTextColor="#A1A1AA" style={styles.input} value={topic} maxLength={500} onChangeText={setTopic} />
    <View style={styles.row}>{(action === 'reply' ? ['once'] : action === 'curate' ? ['once', 'daily'] : ['once', 'daily', 'twice']).map(item => <KitButton key={item} variant={(action === 'reply' ? 'once' : cadence) === item ? 'primary' : 'quiet'} label={t(`agents.workspace.cadence.${item}`, { defaultValue: item === 'once' ? 'Once' : item === 'daily' ? 'Daily' : 'Twice daily' })} onPress={() => setCadence(item)} />)}</View>
    <KitButton variant="quiet" label={t('agents.workspace.useBuilder', 'Use these instructions')} disabled={!topic.trim()} onPress={() => changePrompt(buildAgentPrompt(action, topic, cadence))} />
    {overview.data?.templates.filter(item => item.id !== 'growth').map(item => <View key={item.id} style={styles.card}><KitButton variant="quiet" label={`${item.name}${item.published ? ' · ' + t('agents.workspace.shared', 'Shared') : ''}`} onPress={() => { changePrompt(item.prompt); setTemplateId(item.id); }} /><Text style={styles.muted}>{t('agents.workspace.runs', { defaultValue: '{{runs}} recent runs · {{completed}} completed · {{failed}} failed', runs: item.runs ?? 0, completed: item.completed ?? 0, failed: item.failed ?? 0 })}</Text>{item.evaluation?.checked_at && <Text style={styles.muted}>{t('agents.workspace.planValidated', 'Plan validated')} · {item.evaluation.tools?.join(', ')}</Text>}</View>)}
    <Text style={styles.muted}>{t('agents.workspace.builderHelp', 'Choose a template, describe the action, audience and schedule, then simulate before running. Shared templates are instructions from their authors, not verified capabilities.')}</Text>
    <TextInput accessibilityLabel={t('agents.tasks.instructions', 'Instructions')} style={styles.input} multiline maxLength={4000} value={prompt} onChangeText={changePrompt} />
    <View style={styles.row}><KitButton label={t('agents.workspace.simulate', 'Simulate plan')} disabled={!agentId || !prompt.trim() || preview.isPending} onPress={() => preview.mutate()} /><KitButton variant="quiet" label={t('agents.tasks.run', 'Run task')} disabled={!agentId || !prompt.trim() || run.isPending || run.isSuccess} onPress={() => run.mutate()} /></View>
    {preview.data && <View style={styles.card}><Text style={styles.text}>{preview.data.plan.summary}</Text><Text style={styles.muted}>{preview.data.message}</Text>{preview.data.checks.map((check, index) => <Text key={index} style={styles.text}>{check.tool} · {check.audience} · {check.permission ?? t('agents.workspace.allowed', 'Allowed')}</Text>)}</View>}
    {run.isSuccess && <Text accessibilityRole="alert" style={styles.text}>{t('agents.tasks.queued', 'Task queued.')}</Text>}
    {preview.data?.draft && <Text selectable style={styles.text}>{preview.data.draft}</Text>}
    <TextInput accessibilityLabel={t('agents.workspace.templateName', 'Template name')} placeholder={t('agents.workspace.templateName', 'Template name')} placeholderTextColor="#A1A1AA" style={styles.input} value={name} maxLength={80} onChangeText={setName} />
    <View style={styles.row}><Switch accessibilityLabel={t('agents.workspace.share', 'Share this template with other Agents users')} value={published} onValueChange={setPublished} /><Text style={[styles.text, { flex: 1 }]}>{t('agents.workspace.share', 'Share this template with other Agents users')}</Text></View>
    <KitButton variant="quiet" label={t('agents.workspace.saveTemplate', 'Save template')} disabled={!name.trim() || !prompt.trim() || template.isPending || template.isSuccess} onPress={() => template.mutate()} />
    {template.isSuccess && <Text style={styles.text}>{t('agents.workspace.templateSaved', 'Template saved.')}</Text>}
    <KitButton variant="quiet" label={t('agents.workspace.history', 'Draft inbox and audit log')} onPress={() => setHistory(!history)} />
    {history && <><View style={styles.row}>{['all', 'draft', 'approval', 'succeeded', 'failed', 'uncertain', 'blocked', 'rejected'].map(status => <KitButton key={status} variant={filter === status ? 'primary' : 'quiet'} label={status} onPress={() => setFilter(status)} />)}</View>
      <Text style={styles.muted}>{t('agents.workspace.reversalHelp', "Reversals hide posts, permanently delete comments, restore reactions and profile text, or undo new follows. Views, delivered notifications, minted transactions, profile images and expired timeouts cannot be erased. Hidden posts remain recoverable from their visibility controls.")}</Text>
      {!receipts.length && <Text style={styles.muted}>{t('agents.workspace.empty', 'No matching activity yet.')}</Text>}
      {receipts.map(receipt => <View key={receipt.id} style={styles.card}><Text style={styles.text}>{receipt.tool} · {receipt.status}</Text><Text style={styles.muted}>{new Date(receipt.created_at).toLocaleString()}</Text><Text selectable style={styles.text}>{JSON.stringify(receipt.arguments, null, 2)}</Text>{receipt.result?.error && <Text style={styles.error}>{receipt.result.error}</Text>}{receipt.reversal && <KitButton variant="quiet" label={receipt.reversal} disabled={reverse.isPending} onPress={() => Alert.alert(receipt.reversal!, t('agents.workspace.confirmCorrection', "This changes the published activity. Comment deletion cannot be undone."), [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: 'destructive', onPress: () => reverse.mutate({ id: receipt.id, agent: receipt.agent_id }) }])} />}{receipt.rollback_status && <Text style={styles.muted}>{t('agents.workspace.correction', 'Correction')}: {receipt.rollback_status}</Text>}{receipt.alert_delivery && <Text style={styles.muted}>{t('agents.workspace.alert', 'Alert')}: {receipt.alert_delivery}</Text>}{['draft', 'approval'].includes(receipt.status) && <View style={styles.row}><KitButton label={t('agents.workspace.approve', 'Approve and execute')} disabled={review.isPending} onPress={() => review.mutate({ id: receipt.id, agent: receipt.agent_id, approve: true })} /><KitButton variant="quiet" label={t('agents.workspace.reject', 'Reject')} disabled={review.isPending} onPress={() => review.mutate({ id: receipt.id, agent: receipt.agent_id, approve: false })} /></View>}</View>)}
    </>}
    {[overview.error, preview.error, run.error, template.error, review.error, reverse.error].filter(Boolean).map((error, index) => <Text key={index} accessibilityRole="alert" style={styles.error}>{error?.message}</Text>)}
  </View></PageSection>;
}
const styles = StyleSheet.create({
  panel: { gap: 14 }, title: { color: '#fff', fontSize: 17, fontWeight: '600' }, text: { color: '#fff', fontSize: 14, lineHeight: 21 }, muted: { color: '#D4D4D8', fontSize: 12, lineHeight: 18 }, error: { color: '#fca5a5', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, card: { padding: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 12 }, metric: { flexBasis: '45%', flexGrow: 1, gap: 4, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 }, input: { minHeight: 52, color: '#fff', padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 10, textAlignVertical: 'top' },
});
