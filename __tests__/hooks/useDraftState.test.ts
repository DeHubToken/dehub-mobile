import { act, renderHook } from '@testing-library/react-native';

const mockDisk: Record<string, string> = {};
jest.mock('../../libs/storage', () => ({ storage: {
  getString: (key: string) => mockDisk[key],
  set: (key: string, value: string) => { mockDisk[key] = value; },
  delete: (key: string) => { delete mockDisk[key]; },
} }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: 'alice' }) }));

import { useStoredDraftState, accountDraftKey } from '../../hooks/useDraftState';
import { __resetDraftCacheForTests, readDraft } from '../../libs/draft-cache';

beforeEach(() => { for (const key of Object.keys(mockDisk)) delete mockDisk[key]; __resetDraftCacheForTests(); });
it('restores exact text after a new app storage load', () => {
  const key = accountDraftKey('alice', 'room:one');
  const first = renderHook(() => useStoredDraftState(key, ''));
  act(() => first.result.current[1]('  unfinished\n\n'));
  first.unmount(); __resetDraftCacheForTests();
  const next = renderHook(() => useStoredDraftState(key, ''));
  expect(next.result.current[0]).toBe('  unfinished\n\n');
});
it('isolates account and conversation changes without overwriting saved work', () => {
  let key = accountDraftKey('alice', 'one');
  const field = renderHook(() => useStoredDraftState(key, ''));
  act(() => field.result.current[1]('alice draft'));
  const oldSetter = field.result.current[1];
  key = accountDraftKey('bob', 'one');
  field.rerender({});
  expect(field.result.current[0]).toBe('');
  act(() => field.result.current[1]('bob draft'));
  act(() => oldSetter(''));
  expect(field.result.current[0]).toBe('bob draft');
});
it('retains failed submission, ignores late defaults, and clears after success', async () => {
  const key = accountDraftKey('alice', 'form');
  const field = renderHook(() => useStoredDraftState(key, ''));
  act(() => field.result.current[1]('draft'));
  act(() => field.result.current[1].initialize('server'));
  expect(field.result.current[0]).toBe('draft');
  try { await Promise.reject(new Error('offline')); field.result.current[1].clear(); } catch { /* retain */ }
  expect(JSON.parse(readDraft(key!)).value).toBe('draft');
  await Promise.resolve(); act(() => field.result.current[1].clear());
  expect(readDraft(key!)).toBe('');
});

it('successful submission preserves typing entered while it was pending', () => {
  const key = accountDraftKey('alice', 'room');
  const field = renderHook(() => useStoredDraftState(key, ''));
  act(() => field.result.current[1]('first'));
  act(() => field.result.current[1]('next'));
  act(() => field.result.current[1].complete('first', ''));
  expect(field.result.current[0]).toBe('next');
  expect(JSON.parse(readDraft(key!)).value).toBe('next');
});

it.each(['dm:peer', 'public:composer', 'comment:post:reply', 'post:new:article', 'assistant:conversation', 'editor:project:clip', 'community:form', 'work:job:proof', 'store:listing:title'])(
  'restores %s independently after navigation and a fresh storage load', (scope) => {
    let key = accountDraftKey('alice', scope);
    const first = renderHook(() => useStoredDraftState(key, ''));
    act(() => first.result.current[1]('  unfinished\n '));
    key = accountDraftKey('bob', scope);
    first.rerender({}); expect(first.result.current[0]).toBe('');
    act(() => first.result.current[1]('another account'));
    first.unmount(); __resetDraftCacheForTests();
    const restored = renderHook(() => useStoredDraftState(accountDraftKey('alice', scope), ''));
    expect(restored.result.current[0]).toBe('  unfinished\n ');
    act(() => restored.result.current[1].initialize('late server default'));
    expect(restored.result.current[0]).toBe('  unfinished\n ');
    act(() => restored.result.current[1].complete('  unfinished\n ', ''));
    expect(readDraft(accountDraftKey('alice', scope)!)).toBe('');
    expect(JSON.parse(readDraft(accountDraftKey('bob', scope)!)).value).toBe('another account');
  },
);
