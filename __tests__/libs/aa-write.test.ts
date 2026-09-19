import { SELF_FUNDED_GAS_INSUFFICIENT, writeBatchAA } from '../../libs/aa.write';

describe('self-funded account-abstraction writes', () => {
  it('marks a prefund failure so checkout can retry with sponsorship', async () => {
    const provider = {
      selfFundedSmartAccount: {},
      selfFundedBundlerClient: {
        sendUserOperation: jest.fn().mockRejectedValue(new Error("AA21 didn't pay prefund")),
      },
    };

    const action = writeBatchAA(
      provider,
      [{ to: '0x2222222222222222222222222222222222222222', data: '0x' }],
      { sponsored: false },
    );

    await expect(action).rejects.toThrow(SELF_FUNDED_GAS_INSUFFICIENT);
  });
});
