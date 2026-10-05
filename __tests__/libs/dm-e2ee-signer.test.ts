jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n) }));
jest.mock('../../libs/api.client', () => ({ apiClient: { post: jest.fn(async () => ({})) } }));
const mockRequest = jest.fn();
jest.mock('../../libs/provider.registry', () => ({
  getEoaSigningProvider: () => ({ request: mockRequest }),
  getSigningProvider: () => null,
  OPEN_WALLET_METHOD: 'dehub_openWallet',
}));
const mockRelay = jest.fn();
jest.mock('../../libs/wallet-relay', () => ({
  prepareWalletRelay: (provider: unknown) => mockRelay(provider),
  waitForWalletSignature: (request: () => Promise<string>) => request(),
}));

import { Buffer } from 'buffer';
import { setupIdentity, unloadIdentity } from '../../libs/dm-e2ee/keys';
import { encryptionSignMessage } from '../../libs/dm-e2ee/crypto';

const address = '0x1111111111111111111111111111111111111111';
const encoded = `0x${Buffer.from(encryptionSignMessage(address), 'utf8').toString('hex')}`;
const signature = `0x${'11'.repeat(65)}`;

beforeEach(() => {
  jest.resetAllMocks();
  unloadIdentity();
  mockRequest.mockImplementation(async ({ method }) => method === 'eth_accounts' ? [address] : signature);
});

it('signs the same UTF-8 message bytes as web through a prepared provider', async () => {
  await setupIdentity(address);
  expect(mockRequest).toHaveBeenLastCalledWith({ method: 'personal_sign', params: [encoded, address] });
  expect(mockRelay).toHaveBeenCalledTimes(1);
});

it('does not prompt again after a refused signature', async () => {
  const refused = Object.assign(new Error('User rejected'), { code: 4001 });
  mockRequest.mockImplementation(async ({ method }) => {
    if (method === 'eth_accounts') return [address];
    throw refused;
  });
  await expect(setupIdentity(address)).rejects.toBe(refused);
  expect(mockRequest.mock.calls.filter(([arg]) => arg.method === 'personal_sign')).toHaveLength(1);
});

it('changes parameter order only when the wallet reports invalid parameters', async () => {
  mockRequest.mockImplementation(async ({ method, params }) => {
    if (method === 'eth_accounts') return [address];
    if (params[0] === encoded) throw Object.assign(new Error('Invalid params'), { code: -32602 });
    return signature;
  });
  await setupIdentity(address);
  expect(mockRequest).toHaveBeenLastCalledWith({ method: 'personal_sign', params: [address, encoded] });
});
