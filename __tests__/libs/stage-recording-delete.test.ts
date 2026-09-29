const mockList = jest.fn();
const mockRemove = jest.fn();
const mockWalletScopedClient = jest.fn((_wallet: string) => ({
  storage: { from: () => ({ list: mockList, remove: mockRemove }) },
}));

jest.mock('../../services/supabase', () => ({
  walletScopedClient: (wallet: string) => mockWalletScopedClient(wallet),
}));

import { deleteStageRecordings } from '../../libs/stage-recording-delete';

const STAGE = '4b0c2f5e-1111-4222-8333-944445555666';
const WALLET = '0xAbC0000000000000000000000000000000000001';

describe('deleteStageRecordings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes every object in the stage folder through the wallet client', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'recording.aac' }, { name: 'recording.m4a' }], error: null });
    mockRemove.mockResolvedValue({ data: [{ name: 'a' }, { name: 'b' }], error: null });

    const result = await deleteStageRecordings(STAGE, WALLET);

    expect(mockWalletScopedClient).toHaveBeenCalledWith(WALLET);
    expect(mockList).toHaveBeenCalledWith(STAGE);
    expect(mockRemove).toHaveBeenCalledWith([`${STAGE}/recording.aac`, `${STAGE}/recording.m4a`]);
    expect(result).toEqual({ removed: [`${STAGE}/recording.aac`, `${STAGE}/recording.m4a`], error: null });
  });

  it('treats an empty folder as done', async () => {
    mockList.mockResolvedValue({ data: [], error: null });

    await expect(deleteStageRecordings(STAGE, WALLET)).resolves.toEqual({ removed: [], error: null });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('reports a policy refusal, which storage returns as an empty list', async () => {
    mockList.mockResolvedValue({ data: [{ name: 'recording.aac' }], error: null });
    mockRemove.mockResolvedValue({ data: [], error: null });

    const result = await deleteStageRecordings(STAGE, WALLET);
    expect(result.error).not.toBeNull();
    expect(result.removed).toEqual([]);
  });

  it('reports a storage error', async () => {
    mockList.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(deleteStageRecordings(STAGE, WALLET)).resolves.toEqual({ removed: [], error: 'boom' });
  });
});
