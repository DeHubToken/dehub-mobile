const mockValues = new Map<string, boolean>();
const mockRpc = jest.fn();
const mockShow = jest.fn();
const mockStorage = {
  getBoolean: jest.fn((key: string) => mockValues.get(key)),
  set: jest.fn((key: string, value: boolean) => mockValues.set(key, value)),
  delete: jest.fn((key: string) => mockValues.delete(key)),
};
jest.mock('../../services/supabase', () => ({ supabase: { rpc: mockRpc } }));
jest.mock('../../libs/supabase-wallet-client', () => ({ withWalletHeader: (query: unknown) => query }));
jest.mock('../../libs/toast', () => ({ toastInfo: mockShow }));
jest.mock('i18next', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../../libs/storage', () => ({ storage: mockStorage }));

const rpc = mockRpc;
const show = mockShow;
const storage = mockStorage;
const wallet = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
const legacy = 'dehub:reaction-tip-seen';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  mockValues.clear();
  storage.getBoolean.mockImplementation((key: string) => mockValues.get(key));
  storage.set.mockImplementation((key: string, value: boolean) => mockValues.set(key, value));
  rpc.mockResolvedValue({ data: true, error: null });
});

it('claims once for rapid taps across cards and after a reload', async () => {
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await Promise.all([hint.maybeShowReactionTip(wallet), hint.maybeShowReactionTip(wallet)]);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledTimes(1);
  jest.resetModules();
  const reloaded = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await reloaded.maybeShowReactionTip(wallet);
  expect(show).toHaveBeenCalledTimes(1);
});

it('does not remind an account already taught on another client', async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await hint.maybeShowReactionTip(wallet);
  expect(show).not.toHaveBeenCalled();
});

it('adopts the old device flag without showing the hint again', async () => {
  storage.set(legacy, true);
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await hint.maybeShowReactionTip(wallet);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
  expect(storage.getBoolean(`${legacy}:${wallet}`)).toBe(true);
});

it('cancels a pending hint when the reaction picker opens', async () => {
  let finish!: (result: { data: boolean; error: null }) => void;
  rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  const pending = hint.maybeShowReactionTip(wallet);
  hint.markReactionTipSeen(wallet);
  finish({ data: true, error: null });
  await pending;
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
});

it('scopes the record to the account and normalises its address', async () => {
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await hint.maybeShowReactionTip(wallet.toUpperCase());
  await hint.maybeShowReactionTip(wallet);
  await hint.maybeShowReactionTip(other);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(show).toHaveBeenCalledTimes(2);
});

it('stays quiet on a failed account check and never blocks the like', async () => {
  rpc.mockRejectedValue(new Error('offline'));
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await expect(hint.maybeShowReactionTip(wallet)).resolves.toBeUndefined();
  await hint.maybeShowReactionTip(wallet);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(show).not.toHaveBeenCalled();
});

it('keeps the once-only guard when durable storage is unavailable', async () => {
  storage.getBoolean.mockImplementation(() => { throw new Error('blocked'); });
  storage.set.mockImplementation(() => { throw new Error('blocked'); });
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await hint.maybeShowReactionTip(wallet);
  await hint.maybeShowReactionTip(wallet);
  expect(show).toHaveBeenCalledTimes(1);
  
});

it('does not claim or show a hint for a signed-out like', async () => {
  const hint = require('../../libs/reaction-tip') as typeof import('../../libs/reaction-tip');
  await hint.maybeShowReactionTip(null);
  expect(rpc).not.toHaveBeenCalled();
  expect(show).not.toHaveBeenCalled();
});
