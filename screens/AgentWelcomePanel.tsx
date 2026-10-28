import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch, Pressable, StyleSheet } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getAgentWelcomeLog, getAgentWelcomes, setAgentWelcome, type AgentWelcome, type AgentWelcomeList } from '../services/agent-welcome.service';
import { useUserProfileSheet } from '../context/UserProfileSheetContext';

export const AGENT_WELCOMES_KEY = ['agent-welcomes'] as const;

/**
 * "Welcome new members": this agent follows and/or messages people who just
 * joined, up to a daily number. Matches dehubweb AgentWelcomePanel; every
 * limit lives on the server.
 */
export function AgentWelcomePanel({ agentName }: { agentName: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { showUserProfile } = useUserProfileSheet();
  const list = useQuery({ queryKey: AGENT_WELCOMES_KEY, queryFn: getAgentWelcomes, staleTime: 60_000, retry: 1 });
  const agent = list.data?.agents.find(a => a.username?.toLowerCase() === agentName.toLowerCase());
  const [text, setText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const defaultText = t('agents.welcome.defaultText');
  useEffect(() => { if (agent) setText(agent.text || defaultText); }, [agent?.address, agent?.text]);

  const save = useMutation({
    mutationFn: (change: Partial<Pick<AgentWelcome, 'follow' | 'message' | 'text' | 'perDay'>>) => setAgentWelcome(agent!.address, change),
    onSuccess: updated => client.setQueryData<AgentWelcomeList>(AGENT_WELCOMES_KEY, old => old && ({ ...old, agents: old.agents.map(a => a.address === updated.address ? updated : a) })),
  });
  const log = useQuery({ queryKey: ['agent-welcome-log', agent?.address], queryFn: () => getAgentWelcomeLog(agent!.address), enabled: showLog && !!agent, staleTime: 30_000 });

  if (!agent) return null;
  const max = list.data?.limits.maxPerDay ?? 10;
  const pending = save.isPending ? save.variables : undefined;
  const follow = pending?.follow ?? agent.follow;
  const message = pending?.message ?? agent.message;
  const perDay = pending?.perDay ?? agent.perDay;
  const textChanged = text.trim() !== (agent.text || '').trim();

  return <View style={styles.panel}>
    <View style={styles.copy}>
      <Text style={styles.title}>{t('agents.welcome.title')}</Text>
      <Text style={styles.muted}>{t('agents.welcome.help')}</Text>
    </View>
    <View style={styles.row}>
      <Text style={styles.text}>{t('agents.welcome.follow')}</Text>
      <Switch value={follow} disabled={save.isPending} accessibilityLabel={t('agents.welcome.follow')} onValueChange={value => save.mutate({ follow: value })} />
    </View>
    <View style={styles.row}>
      <Text style={styles.text}>{t('agents.welcome.message')}</Text>
      <Switch value={message} disabled={save.isPending} accessibilityLabel={t('agents.welcome.message')}
        onValueChange={value => save.mutate(value ? { message: true, text: text.trim() || defaultText } : { message: false })} />
    </View>
    {message && <View style={styles.events}>
      <TextInput accessibilityLabel={t('agents.welcome.text')} multiline maxLength={list.data?.limits.maxText ?? 500} value={text} editable={!save.isPending} style={styles.input}
        onChangeText={value => { setText(value); save.reset(); }} />
      <Text style={styles.muted}>{t('agents.welcome.textHelp')}</Text>
      {textChanged && <Pressable accessibilityRole="button" disabled={save.isPending || !text.trim()} onPress={() => save.mutate({ text: text.trim() })}>
        <Text style={[styles.text, styles.link]}>{t('agents.welcome.saveText')}</Text></Pressable>}
    </View>}
    <View style={styles.row}>
      <Text style={styles.text}>{t('agents.welcome.perDay')}</Text>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('agents.welcome.fewer')} disabled={save.isPending || perDay <= 1}
          onPress={() => save.mutate({ perDay: perDay - 1 })} style={[styles.step, perDay <= 1 && styles.dim]}><Text style={styles.text}>−</Text></Pressable>
        <Text style={[styles.text, styles.count]}>{perDay}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('agents.welcome.more')} disabled={save.isPending || perDay >= max}
          onPress={() => save.mutate({ perDay: perDay + 1 })} style={[styles.step, perDay >= max && styles.dim]}><Text style={styles.text}>+</Text></Pressable>
      </View>
    </View>
    {(follow || message) && <Text style={styles.text}>{t('agents.welcome.today', { follows: agent.today.follows, messages: agent.today.messages })}</Text>}
    <Text style={styles.muted}>{t('agents.welcome.limits')}</Text>
    {save.error && <Text accessibilityRole="alert" style={styles.error}>{save.error.message}</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLog }} onPress={() => setShowLog(!showLog)}>
      <Text style={[styles.text, styles.link]}>{t(showLog ? 'agents.welcome.hideLog' : 'agents.welcome.showLog')}</Text>
    </Pressable>
    {showLog && <View style={styles.events}>
      {log.data?.length === 0 && <Text style={styles.muted}>{t('agents.welcome.empty')}</Text>}
      {log.data?.map(entry => <Pressable key={`${entry.kind}-${entry.target.address}`} accessibilityRole="link" onPress={() => showUserProfile(entry.target.address)}>
        <Text style={styles.text}>
          <Text style={styles.muted}>{new Date(entry.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · </Text>
          {t(`agents.welcome.${entry.status === 'done' ? entry.kind === 'follow' ? 'followed' : 'messaged' : entry.status}`)}{' '}
          {entry.target.username ? `@${entry.target.username}` : entry.target.address.slice(0, 8)}
          {entry.reason ? <Text style={styles.muted}> · {entry.reason}</Text> : null}
        </Text>
      </Pressable>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  input: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 72, textAlignVertical: 'top' },
  panel: { gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 },
  copy: { gap: 2 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' }, text: { color: '#fff', fontSize: 14 },
  muted: { color: '#A1A1AA', fontSize: 12 }, link: { textDecorationLine: 'underline' },
  error: { color: '#fca5a5', fontSize: 13 }, events: { gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.4 }, count: { minWidth: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
