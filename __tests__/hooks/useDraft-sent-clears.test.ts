import { act, renderHook } from '@testing-library/react-native';

const mockDisk: Record<string, string> = {};
jest.mock('../../libs/storage', () => ({ storage: {
  getString: (key: string) => mockDisk[key],
  set: (key: string, value: string) => { mockDisk[key] = value; },
  delete: (key: string) => { delete mockDisk[key]; },
} }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => null }));

import { useStoredTextDraft } from '../../hooks/useDraft';
import { useStoredDraftState } from '../../hooks/useDraftState';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';

beforeEach(() => { for (const key of Object.keys(mockDisk)) delete mockDisk[key]; __resetDraftCacheForTests(); });

/** A message that went out must leave every box showing it empty. */
describe('drafts after a confirmed send', () => {
  it('clears when the keyboard added a trailing space while sending', () => {
    const { result } = renderHook(() => useStoredTextDraft('test:dm:space'));
    act(() => result.current[1]('hello there'));
    act(() => result.current[1]('hello there '));
    act(() => { expect(result.current[1].complete('hello there', '')).toBe(true); });
    expect(result.current[0]).toBe('');
  });

  it('keeps words typed after pressing send', () => {
    const { result } = renderHook(() => useStoredTextDraft('test:dm:more'));
    act(() => result.current[1]('first'));
    act(() => result.current[1]('first and more'));
    act(() => { result.current[1].complete('first', ''); });
    expect(result.current[0]).toBe('first and more');
  });

  it('empties a second copy of the same box', () => {
    const { result } = renderHook(() => [useStoredTextDraft('test:dm:twin'), useStoredTextDraft('test:dm:twin')] as const);
    act(() => result.current[0][1]('sent text'));
    expect(result.current[1][0]).toBe('sent text');
    act(() => { result.current[0][1].complete('sent text', ''); });
    expect(result.current[0][0]).toBe('');
    expect(result.current[1][0]).toBe('');
  });

  it('clears a comment with a trailing newline and empties its twin', () => {
    const { result } = renderHook(() => [useStoredDraftState('test:comment', ''), useStoredDraftState('test:comment', '')] as const);
    act(() => result.current[0][1]('nice post'));
    expect(result.current[1][0]).toBe('nice post');
    act(() => result.current[0][1]('nice post\n'));
    act(() => { result.current[0][1].complete('nice post', ''); });
    expect(result.current[0][0]).toBe('');
    expect(result.current[1][0]).toBe('');
  });
});
