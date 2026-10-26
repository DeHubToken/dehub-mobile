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
import type { GenerationDraft } from '../../libs/editor/generationDraft';

beforeEach(() => {
  mockDraftUser = { address: 'alice' };
  for (const key of Object.keys(mockDisk)) delete mockDisk[key];
  __resetDraftCacheForTests();
});

it('isolates an owned film prefill and preserves edited references and prompt across workspace and account changes', () => {
  let owner = 'alice';
  let editorDraft: GenerationDraft | undefined;
  const hook = renderHook(() => useMarketingStudioDraft({ campaign: undefined, editorDraft, owner, scope: 'original', studio: true, initialSettings: () => CREATOR_DEFAULTS.image }));
  act(() => hook.result.current.setInput('Original workspace draft'));
  editorDraft = { kind: 'video', prompt: 'Film shot', aspect: '16:9', owner: 'alice', workspaceId: 'film-one-shot-one-video', draftId: 'film-v1', durationSeconds: 5,
    references: [{ url: 'file:///reference.jpg', label: 'Character' }], cinemaDirection: { era: '1980s' } };
  hook.rerender({});
  expect(hook.result.current.input).toBe('Film shot');
  expect(hook.result.current.settings.referenceAssets).toEqual([{ uri: 'file:///reference.jpg', label: 'Character', kind: 'image' }]);
  expect(hook.result.current.settings.cinemaDirection).toMatchObject({ era: '1980s' });
  act(() => hook.result.current.setInput('Edited film prompt'));
  act(() => hook.result.current.setSettings(previous => ({ ...previous, referenceAssets: [] })));
  owner = 'bob'; mockDraftUser = { address: 'bob' }; hook.rerender({});
  expect(hook.result.current.input).toBe('');
  expect(hook.result.current.settings.referenceAssets ?? []).toEqual([]);
  owner = 'alice'; mockDraftUser = { address: 'alice' }; hook.rerender({});
  expect(hook.result.current.input).toBe('Edited film prompt');
  expect(hook.result.current.settings.referenceAssets).toEqual([]);
  editorDraft = undefined; hook.rerender({});
  expect(hook.result.current.input).toBe('Original workspace draft');
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
