import {
  bytesToHex,
  deriveSolanaAddress,
  deriveSolanaKeypair,
  hexToBytes,
} from '../../libs/solana-derive';

// Two arbitrary but fixed EVM keys. The addresses below are outputs of the
// current derivation — if a change to solana-derive.ts moves them, every
// existing user's Solana wallet has moved too and their funds are stranded.
// That is the point of pinning them.
const KEY_A = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const KEY_B = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('deriveSolanaKeypair', () => {
  it('is deterministic — the same EVM key always yields the same address', () => {
    expect(deriveSolanaAddress(KEY_A)).toBe(deriveSolanaAddress(KEY_A));
  });

  it('does not depend on the 0x prefix or surrounding whitespace', () => {
    const bare = KEY_A.slice(2);
    expect(deriveSolanaAddress(bare)).toBe(deriveSolanaAddress(KEY_A));
    expect(deriveSolanaAddress(`  ${KEY_A}  `)).toBe(deriveSolanaAddress(KEY_A));
  });

  it('is case-insensitive on the hex input', () => {
    expect(deriveSolanaAddress(KEY_A.toUpperCase().replace('0X', '0x'))).toBe(
      deriveSolanaAddress(KEY_A),
    );
  });

  it('gives different wallets different addresses', () => {
    expect(deriveSolanaAddress(KEY_A)).not.toBe(deriveSolanaAddress(KEY_B));
  });

  it('produces a valid 32-byte ed25519 public key', () => {
    const kp = deriveSolanaKeypair(KEY_A);
    expect(kp.publicKey.toBytes()).toHaveLength(32);
    expect(kp.secretKey).toHaveLength(64);
  });

  it('produces a base58 address of plausible length', () => {
    const address = deriveSolanaAddress(KEY_A);
    expect(address.length).toBeGreaterThanOrEqual(32);
    expect(address.length).toBeLessThanOrEqual(44);
    expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it('rejects malformed private keys rather than deriving from garbage', () => {
    expect(() => deriveSolanaKeypair('')).toThrow(/malformed/i);
    expect(() => deriveSolanaKeypair('0xdeadbeef')).toThrow(/malformed/i);
    expect(() => deriveSolanaKeypair('not-hex-at-all')).toThrow(/malformed/i);
    // 63 hex chars — one short of a key.
    expect(() => deriveSolanaKeypair('a'.repeat(63))).toThrow(/malformed/i);
  });
});

describe('hex helpers', () => {
  it('round-trips bytes through hex', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 254, 255]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('accepts a 0x prefix', () => {
    expect(hexToBytes('0x00ff')).toEqual(new Uint8Array([0, 255]));
  });

  it('pads single-digit bytes when encoding', () => {
    expect(bytesToHex(new Uint8Array([1, 2]))).toBe('0102');
  });
});
