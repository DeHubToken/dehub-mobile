import { act, renderHook } from '@testing-library/react-native';

jest.mock('../../services/translation.service', () => ({
  translateText: jest.fn(),
  getUserLanguage: () => 'en',
}));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));

import { translateText } from '../../services/translation.service';
import {
  __resetDmTranslations,
  canTranslateDm,
  getDmTranslation,
  toggleDmTranslation,
  useDmTranslation,
} from '../../libs/dm-translation-store';

const mockTranslate = translateText as jest.Mock;
beforeEach(() => { __resetDmTranslations(); mockTranslate.mockReset(); });

it('offers Translate only for messages with words', () => {
  expect(canTranslateDm('Selam reis')).toBe(true);
  expect(canTranslateDm('👍🔥')).toBe(false);
  expect(canTranslateDm('https://riftn.com/p/1')).toBe(false);
});

it('translates a held message privately, then flips back to the original and again', async () => {
  mockTranslate.mockResolvedValue({ translatedText: 'Hi boss', sourceLang: 'tr', sameLanguage: false });
  const { result } = renderHook(() => useDmTranslation('m1'));
  await act(() => toggleDmTranslation('m1', 'Selam reis https://riftn.com/x'));
  expect(mockTranslate).toHaveBeenCalledWith('Selam reis', 'en', 'auto', { isPublic: false });
  expect(result.current).toEqual({ status: 'shown', text: 'Hi boss' });
  await act(() => toggleDmTranslation('m1', 'Selam reis'));
  expect(result.current).toEqual({ status: 'hidden', text: 'Hi boss' });
  await act(() => toggleDmTranslation('m1', 'Selam reis'));
  expect(result.current?.status).toBe('shown');
  expect(mockTranslate).toHaveBeenCalledTimes(1);
});

it('leaves the message alone when it is already in your language or the call fails', async () => {
  mockTranslate.mockResolvedValueOnce({ translatedText: 'hello', sourceLang: 'en', sameLanguage: true });
  await toggleDmTranslation('m2', 'hello there');
  expect(getDmTranslation('m2')).toBeUndefined();
  mockTranslate.mockRejectedValueOnce(new Error('down'));
  await toggleDmTranslation('m3', 'bonjour mon ami');
  expect(getDmTranslation('m3')).toBeUndefined();
});
