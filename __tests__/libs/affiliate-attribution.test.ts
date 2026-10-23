jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));
jest.mock('expo-linking', () => ({ addEventListener: jest.fn(), getInitialURL: jest.fn() }));
jest.mock('expo-application', () => ({ getInstallReferrerAsync: jest.fn() }));
jest.mock('../../services/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../libs/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));
jest.mock('../../libs/wallet-session', () => ({ ensureWalletSession: jest.fn() }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { attributePendingReferral, captureAffiliateUrl, captureInstallReferrer } from '../../libs/affiliate-attribution';
import { ensureWalletSession } from '../../libs/wallet-session';

const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async key => stored.get(key) ?? null);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key, value) => { stored.set(key, value); });
  (supabase.rpc as jest.Mock).mockReset().mockResolvedValue({ error: null });
  (ensureWalletSession as jest.Mock).mockReset().mockResolvedValue({ token: 'signed-session' });
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
it('waits for a signed session and preserves attribution when signing is unavailable', async () => {
  await captureAffiliateUrl('https://dehub.io/r/PARENT?sub=crew');
  (ensureWalletSession as jest.Mock).mockResolvedValueOnce(null);
  await expect(attributePendingReferral('0x3333333333333333333333333333333333333333')).rejects.toThrow('Sign in');
  expect(supabase.rpc).not.toHaveBeenCalled();
  await attributePendingReferral('0x3333333333333333333333333333333333333333');
  expect(supabase.rpc).toHaveBeenCalledWith('attribute_affiliate_referral', { p_code: 'PARENT', p_sub_id: 'crew' });
});

describe('Play install referrer', () => {
  const originalOS = Platform.OS;
  beforeEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }); });
  afterAll(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });

  it('attributes a fresh install to the ref in its Play referrer, read only once', async () => {
    (Application.getInstallReferrerAsync as jest.Mock).mockResolvedValue('ref=INVITER&sub=promo&utm_source=share');
    await captureInstallReferrer();
    await captureInstallReferrer();
    expect(Application.getInstallReferrerAsync).toHaveBeenCalledTimes(1);
    await attributePendingReferral('0x4444444444444444444444444444444444444444');
    expect(supabase.rpc).toHaveBeenCalledWith('attribute_affiliate_referral', { p_code: 'INVITER', p_sub_id: 'promo' });
  });

  it('ignores organic installs', async () => {
    (Application.getInstallReferrerAsync as jest.Mock).mockResolvedValue('utm_source=google-play&utm_medium=organic');
    await captureInstallReferrer();
    await attributePendingReferral('0x5555555555555555555555555555555555555555');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
