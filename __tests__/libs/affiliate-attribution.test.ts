jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('expo-linking', () => ({ addEventListener: jest.fn(), getInitialURL: jest.fn() }));
jest.mock('../../services/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../libs/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';
import { attributePendingReferral, captureAffiliateUrl } from '../../libs/affiliate-attribution';

const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async key => stored.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key, value) => { stored.set(key, value); });
  (supabase.rpc as jest.Mock).mockReset().mockResolvedValue({ error: null });
});
it('serializes competing arrivals and attributes the original tag after signup', async () => {
  await Promise.all([
    captureAffiliateUrl('https://dehub.io/r/PARENT?sub=john'),
    captureAffiliateUrl('https://dehub.io/r/OTHER?sub=sarah'),
  ]);
  await attributePendingReferral('0x1111111111111111111111111111111111111111');
  expect(supabase.rpc).toHaveBeenCalledWith('attribute_affiliate_referral', { p_code: 'PARENT', p_sub_id: 'john' });
});
it('leaves failed attribution retryable without changing the saved parent', async () => {
  await captureAffiliateUrl('https://dehub.io/r/PARENT?sub=team');
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: new Error('offline') });
  await expect(attributePendingReferral('0x2222222222222222222222222222222222222222')).rejects.toThrow('offline');
  await attributePendingReferral('0x2222222222222222222222222222222222222222');
  expect(supabase.rpc).toHaveBeenCalledTimes(2);
});
