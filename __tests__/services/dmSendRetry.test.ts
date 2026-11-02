const mockConfirm = jest.fn();
const mockFeePayer = jest.fn(async () => '0xfee');
jest.mock('../../store/dm.store', () => ({
  dmState: {},
  dmActions: {
    addOptimistic: jest.fn(), removeOptimistic: jest.fn(), failOptimistic: jest.fn(),
    retryOptimistic: jest.fn(), upsertMessages: jest.fn(), migrateOptimistic: jest.fn(),
  },
}));
jest.mock('../../libs/dmLocked', () => ({ lockDhbForUsd: () => 0 }));
jest.mock('../../services/dm/dm.api', () => ({ uploadDmMedia: jest.fn(), tipNotify: jest.fn(), forwardDmMessage: jest.fn() }));
jest.mock('../../libs/assets.util', () => ({ guessMime: () => 'image/jpeg' }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }) }));
jest.mock('../../config/constants', () => ({ supportedTokens: [] }));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('../../libs/dm-e2ee/keys', () => ({ prepareOutgoing: async (_p: string, content: string) => ({ content }), prepareSession: jest.fn() }));
jest.mock('../../libs/dm-e2ee/media', () => ({ encodeMediaDescriptor: jest.fn() }));
jest.mock('../../libs/dm-e2ee/media-send', () => ({ prepareMediaDescriptor: jest.fn() }));
jest.mock('../../libs/dm-destruct', () => ({ destructFromChoice: jest.fn() }));
jest.mock('../../libs/dm-e2ee/media-files', () => ({}));
jest.mock('../../libs/dm-e2ee/peer', () => ({ peerAddressForConversation: () => null }));
jest.mock('../../libs/dm-send-confirmation', () => ({ confirmDmSend: (...args: unknown[]) => mockConfirm(...args) }));

import { dmSendQueue } from '../../services/dm/dm.send';
import { dmActions } from '../../store/dm.store';

const mockActions = dmActions as unknown as Record<string, jest.Mock>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  dmSendQueue.init({ on: () => () => {}, emitAuthed: jest.fn() } as any);
  dmSendQueue.setFeePayer(mockFeePayer as any);
});
beforeEach(() => jest.clearAllMocks());

it('keeps the pending line key on the saved copy so the bubble is not re-mounted', async () => {
  mockConfirm.mockResolvedValueOnce({ _id: 'server-1', conversation: 'c1', content: 'hi' });
  const tempId = dmSendQueue.sendText({ conversationId: 'c1', userId: 'me', address: '0xme', content: 'hi' });
  expect(await dmSendQueue.waitForDelivery(tempId)).toBe(true);
  expect(mockActions.upsertMessages).toHaveBeenCalledWith('c1', [expect.objectContaining({ _id: 'server-1', _clientKey: tempId })]);
  expect(mockActions.removeOptimistic).toHaveBeenCalledWith('c1', tempId);
});

it('keeps a failed line for Retry, resends it in place and never pays the fee twice', async () => {
  mockConfirm.mockRejectedValueOnce(new Error('offline'));
  const tempId = dmSendQueue.sendText({
    conversationId: 'c1', userId: 'me', address: '0xme', content: 'paid hi',
    dmFee: { required: true, fee: 10, hasFreeAccess: false } as any,
  });
  expect(await dmSendQueue.waitForDelivery(tempId)).toBe(false);
  expect(mockActions.failOptimistic).toHaveBeenCalledWith('c1', tempId, 'offline');
  expect(mockActions.removeOptimistic).not.toHaveBeenCalled();
  expect(dmSendQueue.canRetry(tempId)).toBe(true);

  mockConfirm.mockResolvedValueOnce({ _id: 'server-2', conversation: 'c1', content: 'paid hi' });
  expect(dmSendQueue.retry(tempId)).toBe(true);
  expect(mockActions.retryOptimistic).toHaveBeenCalledWith('c1', tempId);
  await flush(); await flush();
  expect(mockActions.upsertMessages).toHaveBeenCalledWith('c1', [expect.objectContaining({ _id: 'server-2', _clientKey: tempId })]);
  expect(mockFeePayer).toHaveBeenCalledTimes(1);
  expect(dmSendQueue.canRetry(tempId)).toBe(false);
});
