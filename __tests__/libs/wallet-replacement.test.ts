const rpc = jest.fn();
const getSession = jest.fn();
jest.mock('../../services/supabase', () => ({ supabase: {
  auth: { getSession: (...args: unknown[]) => getSession(...args) },
  rpc: (...args: unknown[]) => rpc(...args),
} }));
import { replaceStoredWallet } from '../../libs/wallet-core/replacement';

const oldAddress = '0x1111111111111111111111111111111111111111';
const newAddress = '0x2222222222222222222222222222222222222222';
const payload = { ciphertext: 'new-cipher', salt: 'salt', iv: 'iv', iterations: 0 };
beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'user' } } }, error: null });
  rpc.mockResolvedValue({ data: { eth_address: newAddress }, error: null });
});
it('refuses a stale identity before calling the replacement RPC', async () => {
  await expect(replaceStoredWallet('other-user', oldAddress, newAddress, payload)).rejects.toThrow('Sign in again');
  expect(rpc).not.toHaveBeenCalled();
});
it('surfaces a failed archive instead of falling back to an overwrite', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'Your wallet changed' } });
  await expect(replaceStoredWallet('user', oldAddress, newAddress, payload)).rejects.toThrow('Your wallet changed');
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('refuses a response naming another wallet', async () => {
  rpc.mockResolvedValue({ data: { eth_address: oldAddress }, error: null });
  await expect(replaceStoredWallet('user', oldAddress, newAddress, payload)).rejects.toThrow('not confirmed');
});
it('sends only encrypted seed material and the expected outgoing address', async () => {
  await replaceStoredWallet('user', oldAddress, newAddress, payload);
  expect(rpc).toHaveBeenCalledWith('replace_user_wallet', {
    p_expected_address: oldAddress, p_new_address: newAddress, p_encrypted_seed: 'new-cipher',
    p_salt: 'salt', p_iv: 'iv', p_kdf_iterations: 0,
  });
});
