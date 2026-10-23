import React from 'react';
import { View, Text, Switch, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { agentTaskRequest } from '../services/agents.service';
import { ScreenNames } from '../navigation/ScreenNames';

type AgentLife = {
  sentient: boolean; has_persona: boolean; status: string | null; next_at: string | null; home: string | null;
  daily?: { posts: number; target: number };
  events: { kind: string; content: string | null; target: string | null; created_at: string }[];
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The "Alive" switch: the agent keeps its own day and acts on its own. */
export function AgentLifePanel({ wallet, agentId }: { wallet: string; agentId: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const client = useQueryClient();
  const key = ['agent-life', wallet, agentId];
  const life = useQuery({ queryKey: key, staleTime: 60000,
    queryFn: () => agentTaskRequest<AgentLife>(wallet, { operation: 'life', agent_id: agentId }) });
  const toggle = useMutation({
    mutationFn: (alive: boolean) => agentTaskRequest<AgentLife>(wallet, { operation: 'set_alive', agent_id: agentId, alive }),
    onSuccess: data => client.setQueryData(key, data),
  });
  const data = life.data;
  const alive = toggle.isPending ? !!toggle.variables : !!data?.sentient;
  const state = data?.sentient && data.home ? t(data.status === 'asleep' ? 'agents.life.asleep' : 'agents.life.awake', { home: data.home }) : null;
  return <View style={styles.panel}>
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('agents.life.title')}</Text>
        <Text style={styles.muted}>{t('agents.life.help')}</Text>
      </View>
      <Switch value={alive} disabled={life.isLoading || toggle.isPending} accessibilityLabel={t('agents.life.title')}
        onValueChange={value => toggle.mutate(value)} />
    </View>
    {toggle.isPending && toggle.variables && !data?.has_persona && <Text style={styles.text}>{t('agents.life.starting')}</Text>}
    {toggle.error && <Text accessibilityRole="alert" style={styles.error}>{toggle.error.message}</Text>}
    {data?.sentient && data.daily && <Text style={styles.text}>{t('agents.life.daily', { defaultValue: 'Posts today: {{posts}} · Daily target: {{target}}', ...data.daily })}</Text>}
    {state && <Text style={styles.text}>{state}{data?.next_at ? ` · ${t('agents.life.next', { time: clock(data.next_at) })}` : ''}</Text>}
    {data?.sentient && <View style={styles.events}>
      <Text style={styles.label}>{t('agents.life.recent')}</Text>
      {data.events.length === 0 && <Text style={styles.muted}>{t('agents.life.empty')}</Text>}
      {data.events.slice(0, 6).map(event => {
        const line = <Text style={styles.text}>
          <Text style={styles.muted}>{clock(event.created_at)} · {t(`agents.life.kind.${event.kind}`, { defaultValue: event.kind })}</Text>
          {event.content && event.kind !== 'error' ? ` ${event.content}` : ''}
        </Text>;
        return event.kind === 'post' && event.target
          ? <Pressable key={`${event.kind}-${event.created_at}`} accessibilityRole="link" onPress={() => navigation.navigate(ScreenNames.PostResolver, { tokenId: event.target })}>{line}</Pressable>
          : <View key={`${event.kind}-${event.created_at}`}>{line}</View>;
      })}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, copy: { flex: 1, gap: 2 },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' }, text: { color: '#fff', fontSize: 14 },
  muted: { color: '#A1A1AA', fontSize: 12 }, label: { color: '#A1A1AA', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  error: { color: '#fca5a5', fontSize: 13 }, events: { gap: 6 },
});
