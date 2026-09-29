/**
 * The mini app store list. A failed read (offline, server error) comes back as
 * `null`, not `[]`: an empty array is what an empty store looks like, and the
 * store screen used to tell an offline user that no apps exist.
 */
const mockResult = jest.fn();

jest.mock('../../services/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const step of ['from', 'select', 'in', 'order', 'eq']) chain[step] = () => chain;
  chain.limit = () => Promise.resolve(mockResult());
  chain.maybeSingle = () => Promise.resolve(mockResult());
  return { supabase: chain };
});

import { fetchListedApps } from '../../services/miniapps.service';

describe('fetchListedApps', () => {
  beforeEach(() => mockResult.mockReset());

  it('returns null when the read fails', async () => {
    mockResult.mockReturnValue({ data: null, error: { message: 'TypeError: Network request failed' } });
    await expect(fetchListedApps()).resolves.toBeNull();
  });

  it('returns an empty list when nothing is listed', async () => {
    mockResult.mockReturnValue({ data: [], error: null });
    await expect(fetchListedApps()).resolves.toEqual([]);
  });

  it('returns the listed rows', async () => {
    const row = { id: '1', slug: 'chess', name: 'Chess', tier: 'listed' };
    mockResult.mockReturnValue({ data: [row], error: null });
    await expect(fetchListedApps()).resolves.toEqual([row]);
  });
});
