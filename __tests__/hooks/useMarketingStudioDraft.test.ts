import { act, renderHook } from '@testing-library/react-native';

const mockDisk: Record<string, string> = {};
jest.mock('../../libs/storage', () => ({ storage: {
  getString: (key: string) => mockDisk[key],
  set: (key: string, value: string) => { mockDisk[key] = value; },
  delete: (key: string) => { delete mockDisk[key]; },
} }));
let mockDraftUser: { address: string } | null = { address: 'alice' };
jest.mock('../../context/AuthContext', () => ({ useUser: () => mockDraftUser }));

import { useMarketingStudioDraft } from '../../hooks/useMarketingStudioDraft';
import { CREATOR_DEFAULTS } from '../../libs/creatorStudio';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';

beforeEach(() => {
  mockDraftUser = { address: 'alice' };
  for (const key of Object.keys(mockDisk)) delete mockDisk[key];
  __resetDraftCacheForTests();
});

it('consumes successive campaign formats in a mounted studio and preserves its cached original draft', () => {
  let campaign: unknown;
  let owner: string | null = 'alice';
  const hook = renderHook(() => useMarketingStudioDraft({ campaign, owner, scope: 'original', studio: true, initialSettings: () => CREATOR_DEFAULTS.image }));
  act(() => hook.result.current.setInput('Unfinished original'));
  act(() => hook.result.current.setSettings({ ...CREATOR_DEFAULTS.image, aspect: '16:9' }));
  campaign = { id: 'first', owner: 'alice', draft: { kind: 'image', aspect: '1:1', prompt: 'Square campaign' } };
  hook.rerender({});
  expect(hook.result.current.input).toBe('Square campaign');
  expect(hook.result.current.settings.aspect).toBe('1:1');
  act(() => hook.result.current.setInput('Edited campaign'));
  hook.rerender({});
  expect(hook.result.current.input).toBe('Edited campaign');
  campaign = { id: 'second', owner: 'alice', draft: { kind: 'video', aspect: '9:16', prompt: 'Video campaign' } };
  hook.rerender({});
  expect(hook.result.current.input).toBe('Video campaign');
  expect(hook.result.current.settings).toMatchObject({ mode: 'video', aspect: '9:16' });
  owner = 'bob'; mockDraftUser = { address: 'bob' }; hook.rerender({});
  expect(hook.result.current.input).toBe('');
  expect(hook.result.current.handoff).toBeNull();
  owner = null; mockDraftUser = null; hook.rerender({});
  expect(hook.result.current.input).toBe('');
  owner = 'alice'; mockDraftUser = { address: 'alice' }; campaign = undefined; hook.rerender({});
  expect(hook.result.current.input).toBe('Unfinished original');
  expect(hook.result.current.settings.aspect).toBe('16:9');
  campaign = { id: 'first', owner: 'alice', draft: { kind: 'image', aspect: '1:1', prompt: 'Square campaign' } };
  hook.rerender({});
  expect(hook.result.current.input).toBe('Edited campaign');
});
