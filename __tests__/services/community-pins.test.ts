import { getPinnedCommunities, pinCommunity, unpinCommunity } from '../../services/communities.service';
import { supabase } from '../../services/supabase';
import { withWalletHeader } from '../../libs/supabase-wallet-client';

jest.mock('../../services/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../libs/supabase-wallet-client', () => ({
  withWalletHeader: jest.fn((query: unknown) => query),
}));
jest.mock('../../libs/storage-upload', () => ({}));

const owner = `0x${'A'.repeat(40)}`;

function queryResult(data: unknown = [], error: unknown = null) {
  const query: any = { data, error };
  for (const method of ['select', 'eq', 'order', 'insert', 'delete']) {
    query[method] = jest.fn(() => query);
  }
  (supabase.from as jest.Mock).mockReturnValue(query);
  return query;
}

beforeEach(() => jest.clearAllMocks());

it('reads another profile’s public pins without requesting that owner’s wallet session', async () => {
  const pins = [{ community_id: 'community', display_order: 0 }];
  const query = queryResult(pins);
  await expect(getPinnedCommunities(owner)).resolves.toEqual(pins);
  expect(query.eq).toHaveBeenCalledWith('wallet_address', owner.toLowerCase());
  expect(withWalletHeader).not.toHaveBeenCalled();
});

it('keeps public read failures visible', async () => {
  const error = { message: 'unavailable' };
  queryResult(null, error);
  await expect(getPinnedCommunities(owner)).rejects.toBe(error);
});

it('still authenticates pin and unpin writes', async () => {
  queryResult();
  await pinCommunity(owner, 'community', 0);
  await unpinCommunity(owner, 'community');
  expect(withWalletHeader).toHaveBeenCalledTimes(2);
  for (const call of (withWalletHeader as jest.Mock).mock.calls) expect(call[1]).toBe(owner);
});
