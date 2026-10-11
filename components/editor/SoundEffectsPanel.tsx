import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import { projectTask } from '../../libs/editor/projectTask';
import type { ProjectEditLease } from '../../libs/editor/projectEditGate';
import type { MediaMeta } from '../../libs/editor/storage';
import { importSoundEffect } from '../../libs/editor/importSoundEffect';
import { soundEffectRequest, SFX_MAX_PROMPT_CHARS } from '../../libs/editor/soundEffectDraft';

type Owner = { task: NonNullable<ReturnType<typeof projectTask>>; controller: AbortController; at: number };
export default function SoundEffectsPanel({ at, scope, draftScope, wallet, prefill, subscribe, onAdd, onStart }: {
  at: number; scope: number; draftScope: string; wallet?: string | null; prefill?: string;
  subscribe: (changed: () => void) => () => void;
  onAdd: (media: MediaMeta, start: number) => void; onStart: () => ProjectEditLease | null;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useSurfaceDraft('editor:sfx:prompt', '', draftScope);
  const [seconds, setSeconds] = useState('5'), [auto, setAuto] = useState(true), [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState<string | null>(null);
  const owner = useRef<Owner | null>(null), mounted = useRef(true);
  const current = useRef({ scope, draftScope, wallet }); current.current = { scope, draftScope, wallet };
  const add = useRef(onAdd); add.current = onAdd;
  const cancel = () => {
    const pending = owner.current; if (!pending) return;
    owner.current = null; pending.controller.abort(); pending.task.release();
    if (mounted.current) setBusy(false);
  };
  useEffect(() => { if (prefill) setPrompt.initialize(prefill); }, [prefill, setPrompt]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribe(() => { if (owner.current && !owner.current.task.isCurrent()) cancel(); });
    return () => { mounted.current = false; unsubscribe(); cancel(); };
  }, [draftScope]);
  useEffect(() => () => cancel(), [scope, draftScope, wallet]);
  let valid = !!wallet;
  const duration = auto ? 0 : seconds.trim() ? Number(seconds.replace(',', '.')) : NaN;
  if (!auto && !duration) valid = false;
  try { soundEffectRequest({ text: prompt, durationSeconds: duration, loop }); } catch { valid = false; }
  const generate = async () => {
    if (!valid || owner.current) return;
    const captured = { scope, draftScope, wallet };
    const task = projectTask(onStart(), () => mounted.current && current.current.scope === captured.scope && current.current.draftScope === captured.draftScope && current.current.wallet === captured.wallet);
    if (!task) return;
    const pending: Owner = { task, controller: new AbortController(), at };
    owner.current = pending; setBusy(true); setStatus(null);
    try {
      const media = await importSoundEffect({ text: prompt, durationSeconds: duration, loop }, wallet, pending.controller.signal);
      if (pending.task.isCurrent()) { add.current(media, pending.at); setPrompt.complete(prompt, ''); }
    } catch { if (pending.task.isCurrent()) setStatus(t('common.failedToLoad')); }
    finally {
      pending.task.release();
      if (owner.current === pending) { owner.current = null; if (mounted.current) setBusy(false); }
    }
  };
  return <View style={{ gap: 10 }}>
    <Text className="text-white">{t('creator.audioTaskSfxLabel')}</Text>
    <TextInput accessibilityLabel={t('nav.prompt')} value={prompt} onChangeText={setPrompt} editable={!busy} multiline
      placeholder={t('creator.audioTaskSfxPlaceholder')} placeholderTextColor="#888" className="rounded-xl bg-white/10 px-3 py-2 text-white" />
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={t('creator.auto')} accessibilityState={{ checked: auto, disabled: busy }} disabled={busy} onPress={() => setAuto(value => !value)}><Text className="text-white">{auto ? '☑' : '☐'} {t('creator.auto')}</Text></Pressable>
      {!auto && <><TextInput accessibilityLabel={t('filters.duration')} value={seconds} keyboardType="decimal-pad" onChangeText={setSeconds} editable={!busy} className="w-16 rounded-lg bg-white/10 px-2 py-1 text-white" /><Text className="text-white/50">0.5–30s</Text></>}
      <Pressable accessibilityRole="checkbox" accessibilityLabel={t('creator.loop')} accessibilityState={{ checked: loop, disabled: busy }} disabled={busy} onPress={() => setLoop(value => !value)}><Text className="text-white">{loop ? '☑' : '☐'} {t('creator.loop')}</Text></Pressable>
      <Text className="text-white/50">{prompt.trim().length}/{SFX_MAX_PROMPT_CHARS}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={t(busy ? 'common.cancel' : 'paywall.generate')} disabled={!busy && !valid} onPress={() => { if (busy) cancel(); else void generate(); }} className="items-center rounded-xl bg-white px-4 py-3">
      <Text className="text-black">{t(busy ? 'common.cancel' : 'paywall.generate')}</Text>
    </Pressable>
    {busy && <Text className="text-white/50">{t('common.loading')}</Text>}
    {status && <Text accessibilityRole="alert" className="text-theme-neutrals-400">{status}</Text>}
  </View>;
}
