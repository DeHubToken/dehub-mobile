import { validateArgon2Parameters, validatePbkdf2Iterations } from '../../libs/wallet-core/kdf-limits';

describe('stored wallet KDF limits', () => {
  it.each([{ m: 19_456, t: 2, p: 1 }, { m: 65_536, t: 3, p: 1 }])('preserves existing wallet parameters: %p', (params) => {
    expect(() => validateArgon2Parameters(params)).not.toThrow();
  });
  it.each([
    { m: 2 ** 32, t: 3, p: 1 }, { m: 65_536, t: 1_000_000, p: 1 },
    { m: 65_536, t: 3, p: 0 }, { m: -1, t: 3, p: 1 },
    { m: 65_536, t: 0.5, p: 1 }, { m: NaN, t: 3, p: 1 },
    { m: 65_536, t: 3, p: Infinity },
  ])('rejects unreasonable parameters before allocating memory: %p', (params) => {
    expect(() => validateArgon2Parameters(params)).toThrow('Unsupported wallet encryption parameters');
  });
  it('preserves legacy PBKDF2 and rejects excessive work', () => {
    expect(() => validatePbkdf2Iterations(600_000)).not.toThrow();
    for (const count of [0, -1, NaN, Infinity, 0.5, 10_000_001]) {
      expect(() => validatePbkdf2Iterations(count)).toThrow();
    }
  });
});
