import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorStudioScreen } from '../../screens/AIChatScreen';
import { importGeneratedMedia, type GeneratedMediaSource } from '../../libs/editor/importGeneratedMedia';
import type { GenerationDraft } from '../../libs/editor/generationDraft';
import { toastError, toastSuccess } from '../../libs/toast';
import TurntableRecorder from './TurntableRecorder';

export default function GenerationWindow({ state, onState, draft, onAdd }: {
  state: 'closed' | 'open' | 'minimized';
  onState: (state: 'closed' | 'open' | 'minimized') => void;
  draft: GenerationDraft | null;
  onAdd: (media: Awaited<ReturnType<typeof importGeneratedMedia>>) => void;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const controller = useRef(new AbortController());
  const queue = useRef(Promise.resolve());
  const imports = useRef(new Map<string, Promise<Awaited<ReturnType<typeof importGeneratedMedia>>>>());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  useEffect(() => { if (state !== 'closed') setMounted(true); }, [state]);
  const getImported = useCallback((source: GeneratedMediaSource) => {
    const existing = imports.current.get(source.url);
    if (existing) return existing;
    const result = queue.current.then(() => importGeneratedMedia(source, controller.current.signal));
    imports.current.set(source.url, result);
    queue.current = result.then(() => {}, () => { imports.current.delete(source.url); });
    return result;
  }, []);
  const importResult = useCallback((source: GeneratedMediaSource) => {
    void getImported(source).catch(() => { if (!controller.current.signal.aborted) toastError(t('common.somethingWentWrong')); });
  }, [getImported, t]);
  const useResult = useCallback(async (url: string, kind: 'image' | 'video' | 'audio') => {
    try {
      const media = await getImported({ url, kind });
      if (controller.current.signal.aborted) return;
      onAdd(media);
      onState('minimized');
    } catch { if (!controller.current.signal.aborted) toastError(t('common.somethingWentWrong')); }
  }, [getImported, onAdd, onState, t]);
  // 3D results become a spinning clip, one recording at a time.
  const [models, setModels] = useState<{ id: string; url: string; name?: string }[]>([]);
  const importModel = useCallback((url: string, name?: string) => {
    setModels(old => old.some(job => job.url === url) ? old : [...old, { id: `turntable-${Date.now()}`, url, name }]);
    toastSuccess(t('editor.generate3d.note'));
  }, [t]);
  const modelDone = useCallback((id: string, videoDataUrl: string | null) => {
    const job = models.find(item => item.id === id);
    setModels(old => old.filter(item => item.id !== id));
    if (!job || controller.current.signal.aborted) return;
    if (!videoDataUrl) { toastError(t('creator.studioGenerationFailed')); return; }
    void importGeneratedMedia({ url: videoDataUrl, kind: 'video', name: job.name }, controller.current.signal)
      .then(media => { if (!controller.current.signal.aborted) onAdd(media); })
      .catch(() => { if (!controller.current.signal.aborted) toastError(t('common.somethingWentWrong')); });
  }, [models, onAdd, t]);
  const title = t('upload.generateContent', { defaultValue: 'Generate content' });
  return <>
    {state === 'minimized' && <Pressable accessibilityRole="button" accessibilityLabel={title}
      onPress={() => onState('open')} className="absolute right-4 rounded-full border border-white/20 bg-theme-neutrals-800 px-4 py-3"
      style={{ bottom: insets.bottom + 12, zIndex: 50 }}>
      <Text className="text-sm font-semibold text-theme-neutrals-100">{title}</Text>
    </Pressable>}
    {mounted && <KeyboardAvoidingView behavior="padding" style={{ position: 'absolute', right: 12, bottom: insets.bottom + 8,
      width: Math.min(680, width - 24), height: Math.min(680, height - insets.top - insets.bottom - 32), zIndex: 50,
      display: state === 'open' ? 'flex' : 'none' }}>
      <View className="flex-1 overflow-hidden rounded-2xl border border-white/20 bg-theme-neutrals-900">
        <View className="flex-row items-center gap-3 border-b border-white/10 px-4 py-3">
          <Text className="flex-1 text-sm font-semibold text-theme-neutrals-100">{title}</Text>
          <Pressable onPress={() => onState('minimized')} accessibilityRole="button" accessibilityLabel={t('calls.minimize')} className="p-2"><Text className="text-theme-neutrals-100">−</Text></Pressable>
          <Pressable onPress={() => onState('closed')} accessibilityRole="button" accessibilityLabel={t('common.close')} className="p-2"><Text className="text-theme-neutrals-100">×</Text></Pressable>
        </View>
        <CreatorStudioScreen embedded editorDraft={draft} onGenerated={importResult} onUseGenerated={useResult} onGeneratedModel={importModel} />
      </View>
    </KeyboardAvoidingView>}
    <TurntableRecorder job={models[0] ?? null} onDone={modelDone} />
  </>;
}
