const vi = jest;
import { prepareWorkPayment, runWorkPayment, type WorkPaymentDependencies } from '../../libs/work-payment-flow';

const hash = '0x' + 'a'.repeat(64);
const intent = { id: 'payment', submission_id: 'submission', job_id: 'job', payer_address: 'poster', worker_address: 'worker',
  currency: 'USDC', amount: '0.05', chain_id: 8453, state: 'signing', tx_hash: null, created: true };
function setup() {
  const stored = new Map<string,string>();
  const rpc = vi.fn(async (name: string): Promise<any> => name === 'work_claim_payment' ? intent : name === 'work_finalize_payment' ? 'confirmed' : null);
  const deps: WorkPaymentDependencies = {
    rpc, send: vi.fn(async () => ({ hash, wait: vi.fn(async () => ({ status: 1 })) })),
    receipt: vi.fn(async () => ({ payload: 'verified', signature: 'proof' })),
    storage: { get: async key => stored.get(key) ?? null, set: async (key, value) => { stored.set(key,value); }, remove: async key => { stored.delete(key); } },
  };
  return { deps, rpc, stored };
}

describe('bounty payment recovery', () => {
  it('reserves before signing and confirms only through the verified receipt', async () => {
    const { deps, rpc } = setup();
    await expect(runWorkPayment('submission',8453,deps)).resolves.toBe('confirmed');
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['work_claim_payment','work_record_broadcast','work_finalize_payment']);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  it('a second device checks a broadcast payment without sending another transfer', async () => {
    const { deps, rpc } = setup();
    rpc.mockImplementation(async name => name === 'work_claim_payment' ? {...intent, created:false, state:'broadcast', tx_hash:hash} : 'confirmed');
    await expect(runWorkPayment('submission',8453,deps)).resolves.toBe('confirmed');
    expect(deps.send).not.toHaveBeenCalled();
  });
  it('recovers a hash after its database write failed without paying again', async () => {
    const { deps, rpc, stored } = setup();
    rpc.mockImplementation(async name => { if (name === 'work_claim_payment') return intent; throw new Error('offline'); });
    await expect(runWorkPayment('submission',8453,deps)).rejects.toThrow(hash);
    expect(stored.get('work-payment:payment')).toBe(hash);
    rpc.mockImplementation(async name => name === 'work_claim_payment' ? {...intent,created:false} : 'confirmed');
    await expect(runWorkPayment('submission',8453,deps)).resolves.toBe('confirmed');
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  it('keeps an unconfirmed transaction pending and preserves recovery data', async () => {
    const { deps, rpc, stored } = setup();
    deps.receipt = vi.fn(async () => null);
    await expect(runWorkPayment('submission',8453,deps)).resolves.toBe('pending');
    expect(rpc.mock.calls.some(call => call[0] === 'work_finalize_payment')).toBe(false);
    expect(stored.get('work-payment:payment')).toBe(hash);
  });
  it('a reverted transfer never reports success', async () => {
    const { deps, rpc } = setup();
    rpc.mockImplementation(async name => name === 'work_claim_payment' ? intent : name === 'work_finalize_payment' ? 'failed' : null);
    await expect(runWorkPayment('submission',8453,deps)).rejects.toThrow('reverted');
  });
  it('refuses an ambiguous reserved payment rather than opening another signature', async () => {
    const { deps, rpc } = setup();
    rpc.mockImplementation(async () => ({...intent,created:false}));
    await expect(runWorkPayment('submission',8453,deps)).rejects.toThrow('reserved');
    expect(deps.send).not.toHaveBeenCalled();
  });
  it('releases an explicitly rejected signature but preserves an ambiguous send', async () => {
    const rejected = setup();
    rejected.deps.send = vi.fn(async () => { throw {code:4001}; });
    await expect(runWorkPayment('submission',8453,rejected.deps)).rejects.toEqual({code:4001});
    expect(rejected.rpc).toHaveBeenCalledWith('work_cancel_signature',{p_intent:'payment'});
    const ambiguous = setup();
    ambiguous.deps.send = vi.fn(async () => { throw new Error('connection lost'); });
    await expect(runWorkPayment('submission',8453,ambiguous.deps)).rejects.toThrow('connection lost');
    expect(ambiguous.rpc.mock.calls.some(call => call[0] === 'work_cancel_signature')).toBe(false);
  });
  it('does not sign when reservation authorization fails', async () => {
    const { deps, rpc } = setup();
    rpc.mockRejectedValue(new Error('Invalid wallet session'));
    await expect(runWorkPayment('submission',8453,deps)).rejects.toThrow('Invalid wallet session');
    expect(deps.send).not.toHaveBeenCalled();
  });
  it.each(['Balance lookup failed', 'Wallet is not ready', 'The signing wallet does not match your bounty account'])('releases a reservation when preparation fails: %s', async message => {
    const { deps, rpc } = setup();
    const broadcast = vi.fn(async () => ({ hash }));
    deps.send = async () => {
      await prepareWorkPayment(async () => { throw new Error(message); });
      return broadcast();
    };
    await expect(runWorkPayment('submission',8453,deps)).rejects.toThrow(message);
    expect(broadcast).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('work_cancel_signature',{p_intent:'payment'});
    expect(deps.receipt).not.toHaveBeenCalled();
  });
});
