/**
 * Money that has left the wallet must always be recoverable.
 *
 * Between the pay-per-job launch on 2026-08-28 and 2026-09-03 the AI treasury
 * received four transfers worth 57 DHB and the receipt table held zero rows.
 * A receipt was only written inside the generation function's payment guard,
 * so anything that went wrong between signing and that request arriving lost
 * the money in silence — including `wait()` rejecting on a flaky mobile
 * connection, which reported a failure over a transfer that was already mined
 * and threw the hash away.
 */

import { renderHook, act } from '@testing-library/react-native';

const mockWriteContractAA = jest.fn();
const mockRecordAiPayment = jest.fn();
const mockListUnspentAiPayments = jest.fn();
const mockUseWeb3Provider = jest.fn();
const mockUseERC20Contract = jest.fn();

jest.mock('../../libs/aa.write', () => ({ writeContractAA: (...a: unknown[]) => mockWriteContractAA(...a) }));
jest.mock('../../services/ai.service', () => ({
  quoteAiJob: jest.fn(),
  recordAiPayment: (...a: unknown[]) => mockRecordAiPayment(...a),
  listUnspentAiPayments: (...a: unknown[]) => mockListUnspentAiPayments(...a),
}));
jest.mock('../../hooks/use-web3', () => ({
  useWeb3Provider: () => mockUseWeb3Provider(),
  useERC20Contract: () => mockUseERC20Contract(),
}));

import { useJobPayment } from '../../hooks/useAiPayment';
import { ChainId } from '../../config/constants';

const ACCOUNT = '0xea2824aed1fc55abcf7c6b4493ceea6a09f0d049';
const HASH = `0x${'a'.repeat(64)}`;

function setup() {
  return renderHook(() => useJobPayment(true));
}

describe('useJobPayment — a paid transfer is never lost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWeb3Provider.mockReturnValue({ account: ACCOUNT, chainId: ChainId.BASE_MAINNET });
    mockUseERC20Contract.mockReturnValue({ balanceOf: jest.fn().mockResolvedValue('0') });
    mockListUnspentAiPayments.mockResolvedValue([]);
    mockRecordAiPayment.mockResolvedValue({ txHash: HASH, remainingDhb: 24 });
  });

  it('records a confirmed transfer with the server', async () => {
    mockWriteContractAA.mockResolvedValue({ hash: HASH, wait: async () => ({ status: 1, transactionHash: HASH }) });
    const { result } = setup();

    let hash = '';
    await act(async () => {
      hash = await result.current.payForJob(24);
    });

    expect(hash).toBe(HASH);
    expect(mockRecordAiPayment).toHaveBeenCalledWith(HASH, ACCOUNT);
  });

  it('does not report a mined transfer as a failed payment', async () => {
    mockWriteContractAA.mockResolvedValue({
      hash: HASH,
      // The connection dies while waiting. The transfer will still mine.
      wait: async () => {
        throw new Error('network request failed');
      },
    });
    const { result } = setup();

    let hash = '';
    await act(async () => {
      hash = await result.current.payForJob(24);
    });

    expect(hash).toBe(HASH);
    expect(mockRecordAiPayment).toHaveBeenCalledWith(HASH, ACCOUNT);
  });

  it('says the transfer is saved when even the server cannot confirm it', async () => {
    mockWriteContractAA.mockResolvedValue({
      hash: HASH,
      wait: async () => {
        throw new Error('network request failed');
      },
    });
    mockRecordAiPayment.mockRejectedValue(new Error('not on chain yet'));
    const { result } = setup();

    await act(async () => {
      await expect(result.current.payForJob(24)).rejects.toThrow(/do not send it again/i);
    });
  });

  it('spends DHB banked on the server instead of signing again', async () => {
    mockListUnspentAiPayments.mockResolvedValue([
      { txHash: HASH, chain: 'Base', paidDhb: 24, remainingDhb: 24, purpose: 'job', createdAt: '' },
    ]);
    const { result } = setup();

    let hash = '';
    await act(async () => {
      hash = await result.current.payForJob(24);
    });

    expect(hash).toBe(HASH);
    expect(mockWriteContractAA).not.toHaveBeenCalled();
  });

  it('signs when the banked balance is short, or is a voice session', async () => {
    const fresh = `0x${'b'.repeat(64)}`;
    mockListUnspentAiPayments.mockResolvedValue([
      { txHash: HASH, chain: 'Base', paidDhb: 24, remainingDhb: 2, purpose: 'job', createdAt: '' },
      { txHash: HASH, chain: 'Base', paidDhb: 2800, remainingDhb: 2800, purpose: 'voice', createdAt: '' },
    ]);
    mockWriteContractAA.mockResolvedValue({ hash: fresh, wait: async () => ({ status: 1, transactionHash: fresh }) });
    const { result } = setup();

    let hash = '';
    await act(async () => {
      hash = await result.current.payForJob(24);
    });

    expect(hash).toBe(fresh);
  });

  it('refuses a reverted transfer without banking it', async () => {
    mockWriteContractAA.mockResolvedValue({ hash: HASH, wait: async () => ({ status: 0, transactionHash: HASH }) });
    const { result } = setup();

    await act(async () => {
      await expect(result.current.payForJob(24)).rejects.toThrow(/did not go through/i);
    });
    expect(mockRecordAiPayment).not.toHaveBeenCalled();
  });
});
