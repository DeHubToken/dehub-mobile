const mockRecoveryRead = jest.fn();
const mockPasskeysRead = jest.fn();
const mockSignals: AbortSignal[] = [];
jest.mock('../../services/supabase', () => ({ supabase: {
  from: (table: string) => ({ select: () => ({ eq: () => ({
    abortSignal: (signal: AbortSignal) => {
      mockSignals.push(signal);
      return table === 'user_wallet_recovery'
        ? { maybeSingle: () => mockRecoveryRead() }
        : mockPasskeysRead();
    },
  }) }) }),
} }));
jest.mock('../../libs/wallet-core/crypto', () => ({ getPayloadKdf: jest.fn() }));
import { probeOtherSeedCopies } from '../../libs/wallet-core/store';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSignals.length = 0;
});
afterEach(() => jest.useRealTimers());

it('offers the known recovery routes without leaving a timer behind', async () => {
  mockRecoveryRead.mockResolvedValue({ data: { user_id: 'user' }, error: null });
  mockPasskeysRead.mockResolvedValue({ count: 2, error: null });
  await expect(probeOtherSeedCopies('user')).resolves.toEqual({ recovery: true, passkeys: 2, failed: false });
  expect(jest.getTimerCount()).toBe(0);
});

it('lets a locked-out user continue after a stalled recovery lookup', async () => {
  mockRecoveryRead.mockImplementation(() => new Promise(() => {}));
  mockPasskeysRead.mockResolvedValue({ count: 1, error: null });
  const result = probeOtherSeedCopies('user');
  await jest.advanceTimersByTimeAsync(8_000);
  await expect(result).resolves.toEqual({ recovery: false, passkeys: 1, failed: true });
  expect(mockSignals.every((signal) => signal.aborted)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
