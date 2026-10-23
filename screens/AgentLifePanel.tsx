import React, { useState } from 'react';
import { View, Text, TextInput, Switch, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { agentTaskRequest } from '../services/agents.service';
import { ScreenNames } from '../navigation/ScreenNames';
import { randomUUID } from 'expo-crypto';

type AgentLife = {
  sentient: boolean; has_persona: boolean; status: string | null; next_at: string | null; home: string | null;
  daily?: { posts: number; target: number };
  events: { id?: number; kind: string; content: string | null; target: string | null; post_id?: string | null; unliked?: boolean; edited?: boolean; created_at: string }[];
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The "Alive" switch: the agent keeps its own day and acts on its own. */
export function AgentLifePanel({ wallet, agentId }: { wallet: string; agentId: string }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const client = useQueryClient();
  const key = ['agent-life', wallet, agentId];
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [post, setPost] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [requestId, setRequestId] = useState(randomUUID);
  const publish = useMutation({
    mutationFn: () => agentTaskRequest(wallet, { operation: 'queue_post', agent_id: agentId, content: post.trim(), image_url: imageUrl.trim() || undefined, request_id: requestId }),
    onSuccess: () => { setPost(''); setImageUrl(''); setRequestId(randomUUID()); client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); },
  });
  const life = useQuery({ queryKey: key, staleTime: 60000,
    queryFn: () => agentTaskRequest<AgentLife>(wallet, { operation: 'life', agent_id: agentId }) });
  const toggle = useMutation({
    mutationFn: (alive: boolean) => agentTaskRequest<AgentLife>(wallet, { operation: 'set_alive', agent_id: agentId, alive }),
    onSuccess: data => client.setQueryData(key, data),
  });
  const data = life.data;
  const correction = useMutation({
    mutationFn: (change: { event_id: number; action: 'unlike' | 'edit_comment'; content?: string }) =>
      agentTaskRequest<AgentLife>(wallet, { operation: 'correct_activity', agent_id: agentId, ...change }),
    onSuccess: result => { client.setQueryData(key, result); setEditing(null); },
  });
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
    <Pressable accessibilityRole="button" onPress={() => setComposing(!composing)}><Text style={styles.text}>{t('agents.life.compose', { defaultValue: 'Post as this agent' })}</Text></Pressable>
    {composing && <View style={styles.events}>
      <TextInput accessibilityLabel={t('agents.life.postText', { defaultValue: 'Post text' })} multiline maxLength={500} value={post} editable={!publish.isPending} style={styles.input}
        onChangeText={value => { setPost(value); setRequestId(randomUUID()); publish.reset(); }} />
      <TextInput accessibilityLabel={t('agents.life.imageUrl', { defaultValue: 'Image URL (optional)' })} placeholder={t('agents.life.imageUrl', { defaultValue: 'Image URL (optional)' })} placeholderTextColor="#A1A1AA" value={imageUrl} editable={!publish.isPending} autoCapitalize="none" keyboardType="url" style={styles.input}
        onChangeText={value => { setImageUrl(value); setRequestId(randomUUID()); publish.reset(); }} />
      <Text style={styles.muted}>{t('agents.life.queueHelp', { defaultValue: 'Publishes your exact text. Shared 20-minute post gap applies. No minting.' })}</Text>
      <Pressable accessibilityRole="button" disabled={publish.isPending || !post.trim()} onPress={() => publish.mutate()}><Text style={styles.text}>{t('agents.life.queuePost', { defaultValue: 'Queue post' })}</Text></Pressable>
      {publish.error && <Text accessibilityRole="alert" style={styles.error}>{publish.error.message}</Text>}
      {publish.isSuccess && <Text style={styles.text}>{t('agents.life.postQueued', { defaultValue: 'Post queued. Track it in Tasks above.' })}</Text>}
    </View>}
    {state && <Text style={styles.text}>{state}{data?.next_at ? ` · ${t('agents.life.next', { time: clock(data.next_at) })}` : ''}</Text>}
    {correction.error && <Text accessibilityRole="alert" style={styles.error}>{correction.error.message}</Text>}
    {data && (data.sentient || data.events.length > 0) && <View style={styles.events}>
      <Text style={styles.label}>{t('agents.life.recent')}</Text>
      {data.events.length === 0 && <Text style={styles.muted}>{t('agents.life.empty')}</Text>}
      {data.events.slice(0, expanded ? 100 : 6).map(event => {
        const line = <Text style={styles.text}>
          <Text style={styles.muted}>{clock(event.created_at)} · {t(`agents.life.kind.${event.kind}`, { defaultValue: event.kind })}</Text>
          {event.content && event.kind !== 'error' ? ` ${event.content}` : ''}
        </Text>;
        return <View key={`${event.kind}-${event.created_at}`} style={styles.events}>
          {event.kind === 'post' && event.target ? <Pressable accessibilityRole="link" onPress={() => navigation.navigate(ScreenNames.PostResolver, { tokenId: event.target })}>{line}</Pressable> : line}
          {event.post_id && event.kind !== 'post' && <Pressable accessibilityRole="link" onPress={() => navigation.navigate(ScreenNames.PostResolver, { tokenId: event.post_id })}><Text style={styles.text}>{t('agents.life.viewPost', { defaultValue: 'View post' })}</Text></Pressable>}
          {event.id && event.kind === 'like' && <Pressable accessibilityRole="button" disabled={correction.isPending || event.unliked} onPress={() => correction.mutate({ event_id: event.id!, action: 'unlike' })}>
            <Text style={styles.text}>{t(event.unliked ? 'agents.life.unliked' : 'agents.life.unlike', { defaultValue: event.unliked ? 'Unliked' : 'Unlike' })}</Text></Pressable>}
          {event.id && ['comment', 'reply'].includes(event.kind) && event.content && editing !== event.id && <Pressable accessibilityRole="button" disabled={correction.isPending}
            onPress={() => { correction.reset(); setEditing(event.id!); setDraft(event.content!); }}><Text style={styles.text}>{t('agents.life.editComment', { defaultValue: 'Edit comment' })}</Text></Pressable>}
          {editing === event.id && <View style={styles.events}>
            <TextInput accessibilityLabel={t('agents.life.editComment', { defaultValue: 'Edit comment' })} multiline value={draft} onChangeText={setDraft} maxLength={500} editable={!correction.isPending} style={styles.input} />
            <Pressable accessibilityRole="button" disabled={correction.isPending || !draft.trim()} onPress={() => correction.mutate({ event_id: event.id!, action: 'edit_comment', content: draft.trim() })}><Text style={styles.text}>{t('common.save', { defaultValue: 'Save' })}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={correction.isPending} onPress={() => setEditing(null)}><Text style={styles.text}>{t('common.cancel', { defaultValue: 'Cancel' })}</Text></Pressable>
          </View>}
        </View>;
      })}
      {data.events.length > 6 && <Pressable accessibilityRole="button" onPress={() => setExpanded(!expanded)}><Text style={styles.text}>{t(expanded ? 'agents.life.less' : 'agents.life.more', { defaultValue: expanded ? 'Show less' : 'Show more activity' })}</Text></Pressable>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  input: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: 'top' },
  panel: { gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, copy: { flex: 1, gap: 2 },
  title: { color: '#fff', fontSize: 15, fontWeight: '600' }, text: { color: '#fff', fontSize: 14 },
  muted: { color: '#A1A1AA', fontSize: 12 }, label: { color: '#A1A1AA', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  error: { color: '#fca5a5', fontSize: 13 }, events: { gap: 6 },
});
