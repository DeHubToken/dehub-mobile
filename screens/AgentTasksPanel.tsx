import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageSection, KitButton } from '../components/page/PageKit';
import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
import { agentTaskRequest, type AIAgent, type AgentTask, type AgentTaskAction } from '../services/agents.service';
import { openInApp } from '../libs/links.utils';
import { useTranslation } from 'react-i18next';
import LiquidGlass from '../components/ui/LiquidGlass';
import { WINDOW_ACTIONS, WINDOW_PRESETS, windowPrompt, windowRange, type WindowAction, type WindowPreset } from '../libs/agent-task-window';

const actionNames: Record<string, string> = { dehub_follow: 'agents.tasks.follow', dehub_vote: 'agents.tasks.reaction', dehub_post_create: 'agents.tasks.post', dehub_comment: 'agents.tasks.comment', dehub_update_profile: 'agents.tasks.profile', dehub_view: 'agents.tasks.window.view' };

function postActionUrl(post?: { token_id?: string | number; url?: string }) {
  const id = String(post?.token_id ?? '');
  return /^\d+$/.test(id) ? `https://dehub.io/app/post/${id}` : post?.url;
}

export function AgentTasksPanel({ wallet, agents }: { wallet: string; agents: AIAgent[] }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [prompt, setPrompt] = useSurfaceDraft('agent-task-prompt', '');
  const [chosen, setChosen] = useState('');
  const [swarm, setSwarm] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [requestId, setRequestId] = useState(randomUUID);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [windowMode, setWindowMode] = useState(false);
  const [preset, setPreset] = useState<WindowPreset>('last24h');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [windowActions, setWindowActions] = useState<WindowAction[]>(['view']);
  const [replyStyle, setReplyStyle] = useState('');
  const range = windowRange(preset, custom);
  const windowReady = !!range && windowActions.length > 0 && (!windowActions.includes('reply') || !!replyStyle.trim());
  const active = agents.filter(agent => agent.is_active);
  const agentId = active.some(agent => agent.id === chosen) ? chosen : active[0]?.id;
  const swarmIds = active.filter(agent => selected.includes(agent.id)).map(agent => agent.id);
  const tasks = useQuery({ queryKey: ['agent-tasks', wallet], queryFn: () => agentTaskRequest<{ tasks: AgentTask[] }>(wallet, { operation: 'list' }) });
  const history = useQuery({ queryKey: ['agent-task-history', wallet, historyId], enabled: !!historyId,
    queryFn: () => agentTaskRequest<{ actions: AgentTaskAction[] }>(wallet, { operation: 'history', task_id: historyId }) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); client.invalidateQueries({ queryKey: ['agent-task-history', wallet] }); };
  const create = useMutation({ mutationFn: (text: string) => agentTaskRequest(wallet, { operation: swarm ? 'create_swarm' : 'create',
    ...(swarm ? { agent_ids: swarmIds } : { agent_id: agentId }),
    prompt: text, request_id: requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: (_data, text) => { if (text === prompt) setPrompt.complete(prompt, ''); setRequestId(randomUUID()); refresh(); },
  });
  const changed = () => { setRequestId(randomUUID()); create.reset(); };
  const control = useMutation({ mutationFn: ({ id, operation }: { id: string; operation: string }) => agentTaskRequest(wallet, { operation, task_id: id }), onSuccess: refresh });
  const taskList = tasks.data?.tasks ?? [];
  const currentTasks = taskList.filter(task => !['completed', 'failed', 'cancelled'].includes(task.status));
  const pastTasks = taskList.filter(task => ['completed', 'failed', 'cancelled'].includes(task.status));
  const renderTask = (task: AgentTask) => <View key={task.id} style={styles.card}>
      <Text style={styles.title}>{task.plan.summary}</Text>
      {task.swarm_id && <Text style={styles.muted}>{t('agents.tasks.swarmMember', { index: (task.swarm_index ?? 0) + 1, total: task.swarm_size })}</Text>}
      <Text style={styles.muted}>{t('agents.tasks.meta', { agent: agents.find(agent => agent.id === task.agent_id)?.name || 'agent', status: task.status, total: task.completed_actions })}</Text>
      {task.message && <Text style={styles.text}>{task.message}</Text>}
      {task.status === 'queued' && <Text style={styles.muted}>{t('agents.tasks.next', { time: new Date(task.next_run_at).toLocaleString() })}</Text>}
      {['queued', 'running'].includes(task.status) && <KitButton variant="quiet" label={t('agents.tasks.pause')} disabled={control.isPending} onPress={() => control.mutate({ id: task.id, operation: 'pause' })} />}
      {['paused', 'failed'].includes(task.status) && <KitButton variant="quiet" label={task.needs_review ? t('agents.tasks.skip') : t('agents.tasks.resume')} disabled={control.isPending} onPress={() => control.mutate({ id: task.id, operation: task.needs_review ? 'skip' : 'resume' })} />}
      <KitButton variant="quiet" label={historyId === task.id ? t('agents.tasks.hideActivity') : t('agents.tasks.activity')} onPress={() => setHistoryId(historyId === task.id ? null : task.id)} />
      {historyId === task.id && <>
        {history.error && <Text style={styles.error}>{history.error.message}</Text>}
        {history.isLoading && <Text style={styles.muted}>{t('agents.tasks.loadingActivity')}</Text>}
        {history.data?.actions.map(action => <View key={action.id} style={styles.card}>
          <Text style={styles.text}>{t(actionNames[action.tool] || 'agents.tasks.action')} · {action.status}</Text>
          <Text style={styles.muted}>{new Date(action.created_at).toLocaleString()}</Text>
          {action.target !== 'single' && <Text selectable style={styles.muted}>{action.target}</Text>}
          {action.result?.content && <Text style={styles.text}>{action.result.content}</Text>}
          {action.result?.error && <Text style={styles.error}>{action.result.error}</Text>}
          {action.result?.hint && <Text style={styles.muted}>{action.result.hint}</Text>}
          {postActionUrl(action.result?.post) && <KitButton variant="quiet" label={t('agents.tasks.viewPost')} onPress={() => openInApp(postActionUrl(action.result?.post)!)} />}
        </View>)}
        {history.data?.actions.length === 0 && <Text style={styles.muted}>{t('agents.tasks.emptyActivity')}</Text>}
        {(history.data?.actions.length ?? 0) >= 100 && <Text style={styles.muted}>{t('agents.tasks.latestActivity')}</Text>}
      </>}
    </View>;
  return <PageSection><View style={styles.panel}>
    <Text style={styles.title}>{t('agents.tasks.title')}</Text>
    <Text style={styles.muted}>{t('agents.tasks.description')}</Text>
    {active.length ? <>
      {active.length > 1 && <View style={styles.row}>
        <KitButton variant={swarm ? 'quiet' : 'primary'} label={t('agents.tasks.oneAgent')} onPress={() => { setSwarm(false); setRequestId(randomUUID()); create.reset(); }} />
        <KitButton variant={swarm ? 'primary' : 'quiet'} label={t('agents.tasks.swarm')} onPress={() => { setSwarm(true); setSelected(active.map(agent => agent.id)); setRequestId(randomUUID()); create.reset(); }} />
      </View>}
      {swarm && <Text style={styles.text}>{t('agents.tasks.swarmChoose')}</Text>}
      <View style={styles.row}>{active.map(agent => <Pressable key={agent.id} accessibilityRole="button" accessibilityState={{ selected: swarm ? selected.includes(agent.id) : agentId === agent.id }} disabled={create.isPending}
        onPress={() => { if (swarm) setSelected(ids => ids.includes(agent.id) ? ids.filter(id => id !== agent.id) : [...ids, agent.id]); else setChosen(agent.id); setRequestId(randomUUID()); create.reset(); }}
        style={[styles.chip, (swarm ? selected.includes(agent.id) : agent.id === agentId) && styles.selected]}><Text style={styles.text}>@{agent.name}</Text></Pressable>)}</View>
      {swarm && <Text style={styles.muted}>{t('agents.tasks.swarmHelp')}</Text>}
      <View style={styles.row} accessibilityLabel={t('agents.tasks.window.mode')}>
        <KitButton variant={windowMode ? 'quiet' : 'primary'} label={t('agents.tasks.window.write')} onPress={() => { setWindowMode(false); changed(); }} />
        <KitButton variant={windowMode ? 'primary' : 'quiet'} label={t('agents.tasks.window.title')} onPress={() => { setWindowMode(true); changed(); }} />
      </View>
      {windowMode ? <View style={styles.card}>
        <Text style={styles.text}>{t('agents.tasks.window.period')}</Text>
        <View style={styles.row}>{WINDOW_PRESETS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: preset === value }} disabled={create.isPending}
          onPress={() => { setPreset(value); changed(); }} style={[styles.chip, preset === value && styles.selected]}><Text style={styles.text}>{t(`agents.tasks.window.${value}`)}</Text></Pressable>)}</View>
        {preset === 'custom' && <View style={styles.row}>
          {(['from', 'to'] as const).map(field => <View key={field} style={styles.dateField}><Text style={styles.muted}>{t(`agents.tasks.window.${field}`)}</Text>
            <LiquidGlass style={{ borderRadius: 10 }}><TextInput accessibilityLabel={t(`agents.tasks.window.${field}`)} value={custom[field]} editable={!create.isPending} placeholder="2026-10-17 18:30"
              placeholderTextColor="#A1A1AA" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" style={styles.dateInput}
              onChangeText={value => { setCustom(current => ({ ...current, [field]: value })); changed(); }} /></LiquidGlass></View>)}
        </View>}
        {preset === 'custom' && !!custom.from && !!custom.to && !range && <Text accessibilityRole="alert" style={styles.error}>{t('agents.tasks.window.invalid')}</Text>}
        <Text style={styles.text}>{t('agents.tasks.window.actions')}</Text>
        <View style={styles.row}>{WINDOW_ACTIONS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: windowActions.includes(value) }} disabled={create.isPending}
          onPress={() => { setWindowActions(list => list.includes(value) ? list.filter(item => item !== value) : [...list, value]); changed(); }}
          style={[styles.chip, windowActions.includes(value) && styles.selected]}><Text style={styles.text}>{t(`agents.tasks.window.${value}`)}</Text></Pressable>)}</View>
        {windowActions.includes('reply') && <LiquidGlass style={{ borderRadius: 12 }}><TextInput accessibilityLabel={t('agents.tasks.window.replyStyle')} value={replyStyle} editable={!create.isPending} multiline maxLength={500}
          onChangeText={value => { setReplyStyle(value); changed(); }} placeholder={t('agents.tasks.window.replyPlaceholder')} placeholderTextColor="#A1A1AA" style={[styles.input, { minHeight: 80 }]} /></LiquidGlass>}
        <Text style={styles.muted}>{t('agents.tasks.window.help')}</Text>
      </View> : <LiquidGlass style={{ borderRadius: 12 }}><TextInput accessibilityLabel={t('agents.tasks.instructions')} value={prompt} editable={!create.isPending} multiline maxLength={4000}
        onChangeText={value => { setPrompt(value); setRequestId(randomUUID()); create.reset(); }} placeholder={t('agents.tasks.examples')}
        placeholderTextColor="#A1A1AA" style={styles.input} /></LiquidGlass>}
      <KitButton label={create.isPending ? t('agents.tasks.preparing') : swarm ? t('agents.tasks.runSwarm') : t('agents.tasks.run')} disabled={(windowMode ? !windowReady : !prompt.trim()) || create.isPending || (swarm && swarmIds.length < 2)} onPress={() => create.mutate(windowMode && range ? windowPrompt(range, windowActions, replyStyle) : prompt)} />
      <Text style={styles.muted}>{t('agents.tasks.limits')}</Text>
    </> : <Text style={styles.muted}>{t('agents.tasks.createFirst')}</Text>}
    {create.error && <Text accessibilityRole="alert" style={styles.error}>{create.error.message}</Text>}
    {control.error && <Text accessibilityRole="alert" style={styles.error}>{control.error.message}</Text>}
    {create.isSuccess && <Text accessibilityRole="alert" style={styles.text}>{t('agents.tasks.queued')}</Text>}
    <View style={styles.row}><Text style={styles.title}>{t('agents.tasks.list')}</Text><KitButton variant="quiet" label={t('agents.tasks.refresh')} disabled={tasks.isFetching} onPress={refresh} /></View>
    {tasks.error && <Text accessibilityRole="alert" style={styles.error}>{tasks.error.message}</Text>}
    {tasks.isLoading && <Text style={styles.muted}>{t('agents.tasks.loading')}</Text>}
    {currentTasks.map(renderTask)}
    {pastTasks.length > 0 && <>
      <KitButton variant="quiet" label={`${t('agents.tasks.list')} · ${pastTasks.length}`} onPress={() => setShowPast(value => !value)} />
      {showPast && pastTasks.map(renderTask)}
    </>}
  </View></PageSection>;
}
const styles = StyleSheet.create({
  panel: { gap: 16 }, title: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600' }, text: { color: '#fff', fontSize: 14, lineHeight: 21 },
  muted: { color: '#D4D4D8', fontSize: 13, lineHeight: 20 }, error: { color: '#fca5a5', fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333' }, selected: { borderColor: '#fff' },
  dateField: { flexGrow: 1, flexBasis: 140, gap: 6 }, dateInput: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  input: { minHeight: 148, color: '#fff', backgroundColor: 'rgba(0,0,0,0.2)', padding: 16, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  card: { gap: 10, backgroundColor: 'rgba(0,0,0,0.28)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 14, padding: 16 },
});
