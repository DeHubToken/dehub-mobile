import { renderHook, act, waitFor } from '@testing-library/react-native';

// Everything a jest.mock factory closes over has to be named mock* — the
// factories are hoisted above these declarations, and jest rejects any other
// out-of-scope reference outright.
const mockStore: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore[k] = v;
  }),
}));

// One chainable stub serves both shapes the hook uses:
// select().order().limit() for the read, and insert().select().single() for the
// write. delete().eq() terminates on eq.
let mockListResult: any = { data: [], error: null };
let mockInsertResult: any = { data: { id: 'row-1' }, error: null };
const mockEqSpy = jest.fn(async () => ({ error: null }));

jest.mock('../../services/supabase', () => {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.order = jest.fn(() => q);
  q.limit = jest.fn(async () => mockListResult);
  q.insert = jest.fn(() => q);
  q.single = jest.fn(async () => mockInsertResult);
  q.delete = jest.fn(() => q);
  q.eq = jest.fn((...args: any[]) => mockEqSpy(...(args as [])));
  return { supabase: { from: jest.fn(() => q) } };
});

import { useDrafts } from '../../hooks/useDrafts';
import { supabase } from '../../services/supabase';

const ADDRESS = '0xAbC0000000000000000000000000000000000001';
const KEY = `@dhb_drafts:${ADDRESS.toLowerCase()}`;

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
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    mockListResult = { data: [], error: null };
    mockInsertResult = { data: { id: 'row-1' }, error: null };
  });

  it('reads existing drafts out of AsyncStorage', async () => {
    mockStore[KEY] = JSON.stringify([{ id: 'a', bodyText: 'hello', createdAt: 1 }]);

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
    expect(mockStore[KEY]).toContain('synced');
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
    mockInsertResult = { data: null, error: { message: 'nope' } };

    const { result } = renderHook(() => useDrafts(ADDRESS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveDraft(newDraft('resilient'));
    });

    expect(result.current.drafts).toHaveLength(1);
    expect(result.current.drafts[0].remoteId).toBeUndefined();
  });

  it('folds in server drafts this device has not seen, without media', async () => {
    mockListResult = {
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
    expect(mockEqSpy).toHaveBeenCalledWith('id', 'row-1');
  });
});
