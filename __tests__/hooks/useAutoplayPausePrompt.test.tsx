import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toast } from 'sonner-native';
import { setAppPref } from '../../hooks/useAppPrefs';
import { useAutoplayPausePrompt } from '../../hooks/useAutoplayPausePrompt';
import { AUTOPLAY_PAUSE_CONFIRM_MS, AUTOPLAY_PROMPT_STORAGE_KEY } from '../../libs/autoplay-pause-prompt';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('sonner-native', () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../hooks/useAppPrefs', () => ({
  getAppPrefs: () => ({ autoplay: true }),
  useAppPrefs: () => ({ autoplay: true }),
  setAppPref: jest.fn(),
}));
jest.mock('../../components/ui/GlassToast', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/ui/CustomSwitch', () => {
  const { Switch } = require('react-native');
  return { __esModule: true, default: Switch };
});

afterEach(() => jest.useRealTimers());
it('excludes reaction reversals and lets the toast switch disable the saved autoplay preference', async () => {
  jest.useFakeTimers();
  const { result, rerender, unmount } = renderHook(
    ({ id }: { id: string }) => useAutoplayPausePrompt(id), { initialProps: { id: 'reaction' } },
  );
  act(() => result.current.recordPause());
  act(() => { jest.advanceTimersByTime(300); result.current.cancelPause(); });
  await act(async () => { jest.advanceTimersByTime(AUTOPLAY_PAUSE_CONFIRM_MS); });
  for (const id of ['a', 'b']) {
    rerender({ id });
    act(() => result.current.recordPause());
    await act(async () => { jest.advanceTimersByTime(AUTOPLAY_PAUSE_CONFIRM_MS); });
  }
  expect(toast.custom).not.toHaveBeenCalled();
  rerender({ id: 'c' });
  act(() => result.current.recordPause());
  // Native players are released as soon as the feed scrolls them off screen.
  await act(async () => { unmount(); });
  expect(toast.custom).toHaveBeenCalledTimes(1);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(AUTOPLAY_PROMPT_STORAGE_KEY, expect.any(String));
  const element = (toast.custom as jest.Mock).mock.calls[0][0];
  const view = render(element);
  fireEvent(view.getByLabelText('settings.autoPlay'), 'valueChange', false);
  expect(setAppPref).toHaveBeenCalledWith('autoplay', false);
});
