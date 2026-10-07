const mockRpc = jest.fn();
const mockGetSession = jest.fn();
jest.mock('../../services/supabase', () => ({ supabase: {
  auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  rpc: (...args: unknown[]) => mockRpc(...args),
} }));
import { replaceStoredWallet } from '../../libs/wallet-core/replacement';

const oldAddress = '0x1111111111111111111111111111111111111111';
const newAddress = '0x2222222222222222222222222222222222222222';
const payload = { ciphertext: 'new-cipher', salt: 'salt', iv: 'iv', iterations: 0 };
beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user' } } }, error: null });
  mockRpc.mockResolvedValue({ data: { eth_address: newAddress }, error: null });
});
it('refuses a stale identity before calling the replacement RPC', async () => {
  await expect(replaceStoredWallet('other-user', oldAddress, newAddress, payload)).rejects.toThrow('Sign in again');
  expect(mockRpc).not.toHaveBeenCalled();
});
it('surfaces a failed archive instead of falling back to an overwrite', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'Your wallet changed' } });
  await expect(replaceStoredWallet('user', oldAddress, newAddress, payload)).rejects.toThrow('Your wallet changed');
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
it('refuses a response naming another wallet', async () => {
  mockRpc.mockResolvedValue({ data: { eth_address: oldAddress }, error: null });
  await expect(replaceStoredWallet('user', oldAddress, newAddress, payload)).rejects.toThrow('not confirmed');
});
it('sends only encrypted seed material and the expected outgoing address', async () => {
  await replaceStoredWallet('user', oldAddress, newAddress, payload);
  expect(mockRpc).toHaveBeenCalledWith('replace_user_wallet', {
    p_expected_address: oldAddress, p_new_address: newAddress, p_encrypted_seed: 'new-cipher',
    p_salt: 'salt', p_iv: 'iv', p_kdf_iterations: 0,
  });
});
