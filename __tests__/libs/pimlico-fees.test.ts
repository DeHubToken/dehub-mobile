
import { pimlicoUserOperationFees } from '../../libs/pimlico-fees';
import { userOperationErrorDetail, userOperationValidationMessage } from '../../libs/user-operation-error';

describe('user-operation fees and errors', () => {
  it('uses the bundler quote instead of a lower ordinary Ethereum RPC tip', async () => {
    const request = jest.fn().mockResolvedValue({ fast: {
      maxFeePerGas: '0x1b17dac7', maxPriorityFeePerGas: '0xb7bfa7b',
    } });
    const fees = await pimlicoUserOperationFees.estimateFeesPerGas({ bundlerClient: { request } });
    expect(request).toHaveBeenCalledWith({ method: 'pimlico_getUserOperationGasPrice', params: [] });
    expect(fees).toEqual({ maxFeePerGas: 454548167n, maxPriorityFeePerGas: 192674427n });
  });

  it('does not fall back to an invalid generic fee when the bundler quote fails', async () => {
    const request = jest.fn().mockRejectedValue(new Error('Fee RPC unavailable'));
    await expect(pimlicoUserOperationFees.estimateFeesPerGas({ bundlerClient: { request } })).rejects.toThrow('Fee RPC unavailable');
    request.mockResolvedValue({ fast: { maxFeePerGas: '0x1', maxPriorityFeePerGas: '0x2' } });
    await expect(pimlicoUserOperationFees.estimateFeesPerGas({ bundlerClient: { request } })).rejects.toThrow('Gas fee quote unavailable');
  });

  it('keeps a nested provider reason without logging its RPC credentials or request', () => {
    const detail = userOperationErrorDetail({ message: 'UserOperation failed: paymaster 0x0', cause: {
      details: 'maxPriorityFeePerGas must be at least 1000\nURL: https://rpc.example/?apikey=secret\nRequest body: signature',
    } });
    expect(detail).toBe('maxPriorityFeePerGas must be at least 1000');
    expect(userOperationValidationMessage(detail)).toContain('gas quote changed');
    expect(userOperationValidationMessage('AA25 invalid account nonce')).toContain('nonce changed');
  });
});

