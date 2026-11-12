import { Wallet, utils } from 'ethers';

const mockPost = jest.fn(async (path: string) => (path === '/follow_graph/keys' ? { data: { status: true } } : { data: { status: true } }));
const mockGet = jest.fn(async () => ({ data: { result: ['0x' + 'b'.repeat(40)] } }));
jest.mock('../../libs/api.client', () => ({ apiClient: { post: (...a: any[]) => mockPost(...(a as [string])), get: () => mockGet() } }));
const mockSecure: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure[k] ?? null,
  setItemAsync: async (k: string, v: string) => { mockSecure[k] = v; },
  deleteItemAsync: async (k: string) => { delete mockSecure[k]; },
}));

import { keyMessage, proofMessage, signFollow } from '../../libs/follow-graph';
import { setEoaSigningProvider, setSigningProvider } from '../../libs/provider.registry';

const owner = Wallet.createRandom();
const W = owner.address.toLowerCase();
const A = '0x' + 'a'.repeat(40);
const provider = {
  request: async ({ method, params }: { method: string; params: any[] }) => {
    if (method === 'eth_accounts') return [owner.address];
    if (method === 'personal_sign') return owner.signMessage(utils.arrayify(params[0]));
    return null;
  },
};

it('formats match the backend', () => {
  expect(proofMessage('follow', W, A, 5)).toBe(`riftn-follow:v1:follow:${W}:${A}:5`);
  expect(keyMessage(W, A, new Date('2026-11-12T00:00:00Z'))).toContain(`${A}\n\nWallet: ${W}\nIssued: 2026-11-12T00:00:00.000Z`);
});

it('built-in wallet: OKs a key silently, then signs the follow and the backlog with it', async () => {
  setSigningProvider(provider);
  setEoaSigningProvider(provider);
  signFollow('follow', W, A);
  await new Promise((r) => setTimeout(r, 300));
  const keyCall = mockPost.mock.calls.find((c: any[]) => c[0] === '/follow_graph/keys') as any[];
  const body = keyCall[1];
  expect(utils.verifyMessage(keyMessage(W, body.key.toLowerCase(), new Date(body.issuedAt)), body.signature).toLowerCase()).toBe(W);
  const proofs = mockPost.mock.calls.filter((c: any[]) => c[0] === '/follow_graph/proofs').map((c: any[]) => c[1].proofs[0]);
  expect(proofs).toHaveLength(2);
  expect(utils.verifyMessage(proofMessage('follow', W, A, proofs[0].at), proofs[0].signature).toLowerCase()).toBe(body.key.toLowerCase());
  expect(proofs[1].target).toBe('0x' + 'b'.repeat(40));
});
