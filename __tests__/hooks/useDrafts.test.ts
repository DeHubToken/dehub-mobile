import { renderHook, act, waitFor } from '@testing-library/react-native';

const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => store[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
}));

// One chainable stub serves both shapes the hook uses:
// select().order().limit() for the read, and insert().select().single() for the
// write. delete().eq() terminates on eq.
let listResult: any = { data: [], error: null };
let insertResult: any = { data: { id: 'row-1' }, error: null };
const eqSpy = jest.fn(async () => ({ error: null }));

jest.mock('../../services/supabase', () => {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.order = jest.fn(() => q);
  q.limit = jest.fn(async () => listResult);
  q.insert = jest.fn(() => q);
  q.single = jest.fn(async () => insertResult);
  q.delete = jest.fn(() => q);
  q.eq = jest.fn((...args: any[]) => eqSpy(...(args as [])));
  return { supabase: { from: jest.fn(() => q) } };
});

import { useDrafts } from '../../hooks/useDrafts';
import { supabase } from '../../services/supabase';

const ADDRESS = '0xAbC0000000000000000000000000000000000001';

const newDraft = (bodyText: string) =>
  ({
    bodyText,
    description: '',
    categories: ['Music'],
    imageUris: [],
    videoUri: null,
    thumbnailUri: null,
    coverUri: null,
    monetization: {} as any,
  }) as any;

describe('hooks/useDrafts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(store)) delete store[k];
    listResult = { data: [], error: null };
    insertResult = { data: { id: 'row-1' }, error: null };
  });

  it('reads existing drafts out of AsyncStorage', async () => {
    store[`@dhb_drafts:${ADDRESS.toLowerCase()}`] = JSON.stringify([
      { id: 'a', bodyText: 'hello', createdAt: 1 },
    ]);

    const { result } = renderHook(() => useDrafts(ADDRESS));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.drafts[0].bodyText).toBe('hello');
  });

  it('saves locally and stamps the server row id onto the draft', async () => {
    const { result } = renderHook(() => useDrafts(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveDraft(newDraft('synced'));
    });

    expect(result.current.drafts[0].remoteId).toBe('row-1');
    expect(supabase.from).toHaveBeenCalledWith('post_drafts');
    // The local copy is written before the network call, so it survives either way.
    expect(store[`@dhb_drafts:${ADDRESS.toLowerCase()}`]).toContain('synced');
  });

  it('does not touch the server when there is no address', async () => {
    const { result } = renderHook(() => useDrafts(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveDraft(newDraft('offline'));
    });

    expect(result.current.drafts[0].bodyText).toBe('offline');
    expect(result.current.drafts[0].remoteId).toBeUndefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('keeps the draft locally when the server write fails', async () => {
    insertResult = { data: null, error: { message: 'nope' } };

    const { result } = renderHook(() => useDrafts(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveDraft(newDraft('resilient'));
    });

    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.drafts[0].remoteId).toBeUndefined();
  });

  it('folds in server drafts this device has not seen, without media', async () => {
    listResult = {
      data: [
        {
          id: 'row-9',
          text: 'from the laptop',
          description: 'd',
          selected_category: 'Art',
          created_at: '2026-08-11T00:00:00Z',
          metadata: { categories: ['Art'] },
        },
      ],
      error: null,
    };

    const { result } = renderHook(() => useDrafts(ADDRESS));

    await waitFor(() => expect(result.current.drafts).toHaveLength(1));
    expect(result.current.drafts[0].bodyText).toBe('from the laptop');
    expect(result.current.drafts[0].remoteId).toBe('row-9');
    expect(result.current.drafts[0].imageUris).toEqual([]);
  });

  it('deletes the server row alongside the local one', async () => {
    const { result } = renderHook(() => useDrafts(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveDraft(newDraft('doomed'));
    });
    const id = result.current.drafts[0].id;

    await act(async () => {
      await result.current.deleteDraft(id);
    });

    expect(result.current.drafts).toHaveLength(0);
    expect(eqSpy).toHaveBeenCalledWith('id', 'row-1');
  });
});
