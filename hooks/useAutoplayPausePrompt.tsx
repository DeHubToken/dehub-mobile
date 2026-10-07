import React, { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from 'sonner-native';
import { useTranslation } from 'react-i18next';
import GlassToast from '../components/ui/GlassToast';
import CustomSwitch from '../components/ui/CustomSwitch';
import { getAppPrefs, setAppPref, useAppPrefs } from './useAppPrefs';
import {
  AUTOPLAY_PAUSE_CONFIRM_MS,
  AUTOPLAY_PROMPT_STORAGE_KEY,
  createAutoplayPauseTracker,
} from '../libs/autoplay-pause-prompt';

const tracker = createAutoplayPauseTracker();
const TOAST_ID = 'autoplay-pause-prompt';
let savedPromptAt: Promise<number> | undefined;

function AutoplayPauseToast() {
  const { t } = useTranslation();
  const { autoplay } = useAppPrefs();
  useEffect(() => {
    if (!autoplay) toast.dismiss(TOAST_ID);
  }, [autoplay]);
  return (
    <GlassToast title={t('settings.autoplayPausePrompt')} onClose={() => toast.dismiss(TOAST_ID)}>
      <View className="mt-3 flex-row items-center justify-between gap-4">
        <Text className="flex-1 text-sm text-white">{t('settings.autoPlay')}</Text>
        <CustomSwitch
          value={autoplay}
          accessibilityLabel={t('settings.autoPlay')}
          onValueChange={(enabled) => setAppPref('autoplay', enabled)}
        />
      </View>
    </GlassToast>
  );
}

async function suggestAfterPause(videoId: string) {
  savedPromptAt ??= AsyncStorage.getItem(AUTOPLAY_PROMPT_STORAGE_KEY)
    .then((value) => Number(value) || 0).catch(() => 0);
  const lastPromptAt = await savedPromptAt;
  if (!getAppPrefs().autoplay) return;
  const now = Date.now();
  if (!tracker.recordPause(videoId, now, lastPromptAt)) return;
  void AsyncStorage.setItem(AUTOPLAY_PROMPT_STORAGE_KEY, String(now)).catch(() => {});
  toast.custom(<AutoplayPauseToast />, { id: TOAST_ID, duration: Infinity });
}

export function useAutoplayPausePrompt(videoId: string | number | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPause = useRef<(() => void) | null>(null);
  const cancelPause = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pendingPause.current = null;
  }, []);
  useEffect(() => () => {
    // Scrolling releases native players immediately. Keep the confirmed pause
    // even if the card leaves before the reaction gesture window ends.
    const confirm = pendingPause.current;
    cancelPause();
    confirm?.();
  }, [videoId, cancelPause]);
  const recordPause = useCallback(() => {
    cancelPause();
    if (videoId == null || !getAppPrefs().autoplay) return;
    pendingPause.current = () => { void suggestAfterPause(String(videoId)); };
    timer.current = setTimeout(() => {
      const confirm = pendingPause.current;
      cancelPause();
      confirm?.();
    }, AUTOPLAY_PAUSE_CONFIRM_MS);
  }, [videoId, cancelPause]);
  return { recordPause, cancelPause };
}
