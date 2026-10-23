import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { KitButton } from '../components/page/PageKit';
import { agentTaskRequest } from '../services/agents.service';

export function AgentModerationPanel({ wallet, agentId, refresh }: { wallet: string; agentId: string; refresh: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [post, setPost] = useState('');
  const [target, setTarget] = useState('');
  const [seconds, setSeconds] = useState('300');
  const action = useMutation({ mutationFn: () => agentTaskRequest<{ message?: string }>(wallet, { operation: 'workspace_moderate', agent_id: agentId, arguments: { token_id: post, target_wallet: target, seconds: Number(seconds) } }), onSettled: refresh });
  const input = { color: '#fff', borderWidth: 1, borderColor: '#71717a', padding: 12, borderRadius: 10 };
  return <View style={{ gap: 12 }}>
    <KitButton variant="quiet" label={t('agents.workspace.moderation', "Stream moderation")} onPress={() => setOpen(!open)} />
    {open && <>
      <Text style={{ color: '#d4d4d8' }}>{t('agents.workspace.moderationHelp', "Enable moderation permission first. The account must already be the stream creator or an assigned moderator. Approval and draft modes still apply. Timeouts expire automatically.")}</Text>
      <TextInput accessibilityLabel={t('agents.workspace.streamId', "Stream post ID")} placeholder={t('agents.workspace.streamId', "Stream post ID")} placeholderTextColor="#a1a1aa" keyboardType="numeric" style={input} value={post} onChangeText={setPost} />
      <TextInput accessibilityLabel={t('agents.workspace.participant', "Participant wallet")} placeholder={t('agents.workspace.participantHint', "Participant wallet (0x…)")} placeholderTextColor="#a1a1aa" autoCapitalize="none" style={input} value={target} onChangeText={setTarget} />
      <TextInput accessibilityLabel={t('agents.workspace.timeout', "Timeout seconds")} keyboardType="numeric" style={input} value={seconds} onChangeText={setSeconds} />
      <KitButton label={t('agents.workspace.submitTimeout', "Submit timeout")} disabled={action.isPending || !/^\d+$/.test(post) || !/^0x[0-9a-f]{40}$/i.test(target) || Number(seconds) < 30 || Number(seconds) > 3600} onPress={() => action.mutate()} />
      {action.data && <Text style={{ color: '#fff' }}>{action.data.message ?? t('agents.workspace.handled', "Request handled. See the audit log.")}</Text>}
      {action.error && <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{action.error.message}</Text>}
    </>}
  </View>;
}
