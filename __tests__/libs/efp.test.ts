const W = '0x' + '1'.repeat(40);
let mockSetup: any = {};
let mockExternal = false;
const mockPaths: string[] = [];
const mockBatch = jest.fn(async () => ({ hash: '0x1' }));
jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: async () => ({ data: { result: { status: 'on', synced: 2, error: null } } }),
    post: async (path: string) => {
      mockPaths.push(path);
      if (path.endsWith('/efp/setup')) return { data: { result: mockSetup } };
      return { data: { result: { ok: true, status: 'on' } } };
    },
  },
}));
jest.mock('../../libs/provider.registry', () => ({ isExternalSigner: () => mockExternal }));
jest.mock('../../libs/wallets.local', () => ({ getLocalAccountDetails: async () => ({ privateKey: '0x' + '2'.repeat(64) }) }));
jest.mock('../../libs/wallet-core/smart-account', () => ({ setupAAProvider: async () => ({ request: async () => ['0x' + '1'.repeat(40)] }) }));
jest.mock('../../libs/aa.write', () => ({ writeBatchAA: (...a: any[]) => (mockBatch as any)(...a) }));

import { turnOnEfp } from '../../libs/efp';

const calls = [{ to: '0xmint', data: '0x01' }, { to: '0xrec', data: '0x02' }];

beforeEach(() => { mockPaths.length = 0; mockBatch.mockClear(); mockExternal = false; });

it('built-in wallet: both calls in one sponsored batch on Base, then confirm', async () => {
  mockSetup = { ok: true, status: 'pending', calls };
  expect(await turnOnEfp(W)).toBe('on');
  expect(mockBatch).toHaveBeenCalledWith(expect.anything(), calls, expect.anything());
  expect(mockPaths).toContain('/follow_graph/efp/confirm');
});

it('own wallets are sent to riftn.com, nothing is asked', async () => {
  mockExternal = true;
  expect(await turnOnEfp(W)).toBe('use-web');
  expect(mockPaths).toHaveLength(0);
});

it('an existing EFP list sends nothing', async () => {
  mockSetup = { ok: false, error: 'already-has-list' };
  expect(await turnOnEfp(W)).toBe('already-has-list');
  expect(mockBatch).not.toHaveBeenCalled();
});
