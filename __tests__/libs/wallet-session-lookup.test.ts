import { fetchWalletReliably } from '../../libs/wallet-core/store';
import { supabase } from '../../services/supabase';

jest.mock('../../services/supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, from: jest.fn() } }));
jest.mock('../../libs/wallet-core/crypto', () => ({ getPayloadKdf: jest.fn() }));

describe('wallet identity lookup', () => {
  it('treats another identity session as unavailable, not a missing wallet', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'other-user' } } } });
    await expect(fetchWalletReliably('wallet-owner', { attempts: 1 })).resolves.toEqual({ wallet: null, failed: true });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
