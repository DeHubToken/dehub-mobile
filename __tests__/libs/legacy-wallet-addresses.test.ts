import { legacyWalletAddresses } from '../../libs/legacy-wallet-addresses';

jest.mock('../../services/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) } },
}));
jest.mock('../../libs/wallet-core/store', () => ({
  fetchWallet: jest.fn(async () => ({
    ethAddress: '0x1111111111111111111111111111111111111111',
    payload: null,
  })),
}));
jest.mock('../../libs/wallet-core/predict-safe-address', () => ({
  predictSafeAddress: jest.fn(async () => '0x2222222222222222222222222222222222222222'),
}));

describe('legacyWalletAddresses', () => {
  it('checks the session, owner EOA and deterministic Safe without duplicates', async () => {
    await expect(legacyWalletAddresses('0x2222222222222222222222222222222222222222')).resolves.toEqual([
      '0x2222222222222222222222222222222222222222',
      '0x1111111111111111111111111111111111111111',
    ]);
  });
});
