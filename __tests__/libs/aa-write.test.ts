import { SELF_FUNDED_GAS_INSUFFICIENT, writeBatchAA, writeContractAA } from '../../libs/aa.write';
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ error: jest.fn() }) }));

describe('self-funded account-abstraction writes', () => {
  it('does not switch payment mode after a user operation was accepted', async () => {
    const provider = { selfFundedSmartAccount: {}, selfFundedBundlerClient: {
      sendUserOperation: jest.fn().mockResolvedValue('0xoperation'),
      waitForUserOperationReceipt: jest.fn().mockRejectedValue(new Error('prefund receipt lookup failed')),
    } };
    await expect(writeBatchAA(provider,
      [{ to: '0x2222222222222222222222222222222222222222', data: '0x' }], { sponsored: false },
    )).rejects.not.toThrow(SELF_FUNDED_GAS_INSUFFICIENT);
  });
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

describe('external-wallet transaction readiness', () => {
  const contractFor = (provider: any) => ({
    address: '0x2222222222222222222222222222222222222222',
    signer: { provider: { provider } },
    callStatic: { sendTip: jest.fn().mockResolvedValue(undefined) },
    sendTip: jest.fn().mockResolvedValue({ hash: '0xhash', wait: jest.fn() }),
  });

  it('waits for the ethers-wrapped relay before preflight and sends the original tip once', async () => {
    let reopen!: () => void;
    const relay = { connected: false, restartTransport: jest.fn(() => new Promise<void>(resolve => {
      reopen = () => { relay.connected = true; resolve(); };
    })) };
    const contract = contractFor({ signer: { client: { core: { relayer: relay } } } });
    const args = [12, 500, '0x3333333333333333333333333333333333333333'];
    const pending = writeContractAA(contract, 'sendTip', args);
    await Promise.resolve();
    expect(contract.callStatic.sendTip).not.toHaveBeenCalled();
    expect(contract.sendTip).not.toHaveBeenCalled();
    reopen();
    await expect(pending).resolves.toMatchObject({ hash: '0xhash' });
    expect(contract.sendTip).toHaveBeenCalledTimes(1);
    expect(contract.sendTip).toHaveBeenCalledWith(...args, expect.any(Object));
  });

  it('stops before preflight when the connection fails', async () => {
    const contract = contractFor({ client: { core: { relayer: {
      restartTransport: jest.fn().mockRejectedValue(new Error('Offline')),
    } } } });
    await expect(writeContractAA(contract, 'sendTip', [12, 500])).rejects.toThrow('Offline');
    expect(contract.callStatic.sendTip).not.toHaveBeenCalled();
    expect(contract.sendTip).not.toHaveBeenCalled();
  });

  it('keeps injected and built-in wallet sends working', async () => {
    const request = jest.fn();
    const contract = contractFor({ request });
    await writeContractAA(contract, 'sendTip', [12, 500]);
    expect(contract.sendTip).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });
});
