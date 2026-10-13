import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorStudioScreen } from '../../screens/AIChatScreen';
import { importGeneratedMedia, type GeneratedMediaSource } from '../../libs/editor/importGeneratedMedia';
import type { GenerationDraft } from '../../libs/editor/generationDraft';
import { toastError } from '../../libs/toast';

export default function GenerationWindow({ state, onState, draft }: {
  state: 'closed' | 'open' | 'minimized';
  onState: (state: 'closed' | 'open' | 'minimized') => void;
  draft: GenerationDraft | null;
}) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const controller = useRef(new AbortController());
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  useEffect(() => { if (state !== 'closed') setMounted(true); }, [state]);
  const importResult = useCallback((source: GeneratedMediaSource) => {
    queue.current = queue.current.then(async () => {
      if (controller.current.signal.aborted) return;
      try { await importGeneratedMedia(source, controller.current.signal); }
      catch { if (!controller.current.signal.aborted) toastError(t('common.somethingWentWrong')); }
    });
  }, [t]);
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
        <CreatorStudioScreen embedded editorDraft={draft} onGenerated={importResult} />
      </View>
    </KeyboardAvoidingView>}
  </>;
}
