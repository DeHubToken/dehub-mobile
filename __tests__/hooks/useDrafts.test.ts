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

// One chainable stub serves every shape the hook uses:
// select().eq().order().limit() for the read, insert().select().single() for
// the write, and delete().eq() — awaited directly — for the remove. The stub
// is thenable so awaiting the bare chain (the delete path) resolves, and
// setHeader models the wallet-header client the post_drafts RLS requires.
let mockListResult: any = { data: [], error: null };
let mockInsertResult: any = { data: { id: 'row-1' }, error: null };
const mockEqSpy = jest.fn();

jest.mock('../../services/supabase', () => {
  // Mirrors the real supabase-js shape: every method returns the builder and
  // the builder itself is thenable — which is what lets withWalletHeader call
  // setHeader on the finished chain before it is awaited.
  const q: any = {};
  let pending: () => any = () => ({ error: null });
  q.select = jest.fn(() => q);
  q.order = jest.fn(() => q);
  q.limit = jest.fn(() => {
    pending = () => mockListResult;
    return q;
  });
  q.insert = jest.fn(() => q);
  q.single = jest.fn(() => {
    pending = () => mockInsertResult;
    return q;
  });
  q.delete = jest.fn(() => {
    pending = () => ({ error: null });
    return q;
  });
  q.eq = jest.fn((...args: any[]) => {
    mockEqSpy(...(args as []));
    return q;
  });
  q.setHeader = jest.fn(() => q);
  q.then = (resolve: any, reject: any) => Promise.resolve(pending()).then(resolve, reject);
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
    // A remote row with no metadata.monetization (a web-created draft) must
    // restore as a usable state object, not undefined — see fromRow.
    expect(result.current.drafts[0].monetization).toBeTruthy();
    // The RLS gate: without this header the select matches zero rows.
    const chain = (supabase.from as jest.Mock).mock.results[0]?.value;
    expect(chain.setHeader).toHaveBeenCalledWith('x-wallet-address', ADDRESS.toLowerCase());
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
