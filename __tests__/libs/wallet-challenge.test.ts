import { validateWalletChallenge, submitWalletProof } from '../../libs/wallet-challenge';

const address = '0x' + '11'.repeat(20);
const proof = {
  challengeId: 'a'.repeat(64), address, chainId: 8453,
  purpose: 'login-web' as const, timestamp: 1_800_000_000,
  message: [
    'dehub.io requests wallet verification.', '',
    'URI: https://dehub.io', 'Version: 2',
    'Address: ' + address, 'Chain ID: 8453', 'Purpose: login-web',
    'Nonce: ' + 'a'.repeat(64),
    'Issued At: 2027-01-15T08:00:00.000Z',
    'Expiration Time: 2027-01-15T08:10:00.000Z', '',
    'This request is single-use. It does not authorize a blockchain transaction.',
  ].join('\n'),
};
describe('wallet challenge protocol', () => {
  it('accepts the server protocol fixture without relying on the device clock', () => {
    expect(validateWalletChallenge(proof, address, 8453, 'login-web')).toBe(proof);
  });
  it('refuses a different address, chain, operation, nonce or message', () => {
    for (const changed of [
      { address: '0x' + '22'.repeat(20) }, { chainId: 1 },
      { purpose: 'rotate-wallet' as const }, { challengeId: 'b'.repeat(64) },
      { message: 'Please transfer all funds' }, { timestamp: Infinity },
    ]) expect(() => validateWalletChallenge({ ...proof, ...changed }, address, 8453, 'login-web')).toThrow();
  });
  it('uses a fresh proof after a consumed response, never retries the old proof', async () => {
    const sent: string[] = [];
    let renewals = 0;
    const result = await submitWalletProof('old', async () => { renewals++; return 'fresh'; }, async value => {
      sent.push(value);
      if (value === 'old') throw Object.assign(new Error('used'), { code: 'WALLET_CHALLENGE_UNAVAILABLE' });
      return 'session';
    });
    expect(result).toBe('session');
    expect(sent).toEqual(['old', 'fresh']);
    expect(renewals).toBe(1);
  });
  it('bounds retries and propagates declined signing or ordinary errors', async () => {
    let attempts = 0;
    const replay = Object.assign(new Error('used'), { code: 'WALLET_CHALLENGE_UNAVAILABLE' });
    await expect(submitWalletProof('old', async () => 'new', async () => { attempts++; throw replay; })).rejects.toBe(replay);
    expect(attempts).toBe(2);
    const declined = new Error('cancelled');
    await expect(submitWalletProof('old', async () => { throw declined; }, async () => { throw replay; })).rejects.toBe(declined);
    await expect(submitWalletProof('old', async () => { throw new Error('must not renew'); }, async () => { throw declined; })).rejects.toBe(declined);
  });
});

