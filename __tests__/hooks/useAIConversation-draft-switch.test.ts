import { act, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
import { useAIConversation } from '../../hooks/useAIConversation';

jest.mock('../../context/AuthContext', () => ({ useUser: () => null }));
jest.mock('../../services/supabase', () => ({ supabase: {} }));
jest.mock('../../libs/supabase-wallet-client', () => ({ withWalletHeader: jest.fn() }));
jest.mock('../../libs/assistantMedia', () => ({ materialise: jest.fn() }));
jest.mock('../../libs/storage-upload', () => ({ fileExtension: jest.fn(), uploadLocalFileToBucket: jest.fn() }));

beforeEach(async () => {
  await AsyncStorage.clear();
  storage.delete('dehub-drafts-v1');
  __resetDraftCacheForTests();
});

it('saves a delayed reply in its original thread after New Chat without replacing the new thread', async () => {
  const hook = renderHook(() => useAIConversation('anon'));
  const first = [{ role: 'user' as const, content: 'Original question' }];
  await act(async () => { await hook.result.current.saveMessage(first); });
  const originalId = hook.result.current.getConversationId();
  const finishOriginal = hook.result.current.saveMessage;
  act(() => hook.result.current.startNewConversation());
  const next = [{ role: 'user' as const, content: 'Different question' }];
  await act(async () => { await hook.result.current.saveMessage(next); });
  const nextId = hook.result.current.getConversationId();
  await act(async () => { await finishOriginal([...first, { role: 'assistant', content: 'Delayed answer' }]); });
  expect(nextId).not.toBe(originalId);
  expect(hook.result.current.getConversationId()).toBe(nextId);
  expect(hook.result.current.messages).toEqual(next);
  const original = JSON.parse((await AsyncStorage.getItem(`ai_assistant_conv_anon_${originalId}`))!);
  const current = JSON.parse((await AsyncStorage.getItem(`ai_assistant_conv_anon_${nextId}`))!);
  expect(original.messages.at(-1).content).toBe('Delayed answer');
  expect(current.messages).toEqual(next);
});
