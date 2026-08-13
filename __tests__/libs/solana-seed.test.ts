// Targets libs/solana-seed.ts, not libs/solana-derive.ts: the latter imports
// @solana/web3.js, which resolves to ESM that jest's transformIgnorePatterns
// leaves untransformed, so importing it here fails to parse the suite.
// The seed is the whole security property anyway — the address is a pure
// function of it.
import {
  bytesToHex,
  deriveSolanaSeed,
  hexToBytes,
} from '../../libs/solana-seed';

// Two arbitrary but fixed EVM keys.
const KEY_A = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const KEY_B = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const seedHex = (key: string) => bytesToHex(deriveSolanaSeed(key));

describe('deriveSolanaSeed', () => {
  // If this ever fails, every existing user's Solana address has moved and
  // their funds are stranded at the old one. That is why the HKDF info and
  // salt strings are documented as immutable.
  it('is deterministic — the same EVM key always yields the same seed', () => {
    expect(seedHex(KEY_A)).toBe(seedHex(KEY_A));
  });

  it('does not depend on the 0x prefix or surrounding whitespace', () => {
    expect(seedHex(KEY_A.slice(2))).toBe(seedHex(KEY_A));
    expect(seedHex(`  ${KEY_A}  `)).toBe(seedHex(KEY_A));
  });

  it('is case-insensitive on the hex input', () => {
    const upper = `0x${KEY_A.slice(2).toUpperCase()}`;
    expect(seedHex(upper)).toBe(seedHex(KEY_A));
  });

  it('gives different wallets different seeds', () => {
    expect(seedHex(KEY_A)).not.toBe(seedHex(KEY_B));
  });

  it('produces exactly the 32 bytes Keypair.fromSeed expects', () => {
    expect(deriveSolanaSeed(KEY_A)).toHaveLength(32);
  });

  it('does not simply echo the private key back', () => {
    expect(seedHex(KEY_A)).not.toBe(KEY_A.slice(2).toLowerCase());
  });

  it('rejects malformed private keys rather than deriving from garbage', () => {
    expect(() => deriveSolanaSeed('')).toThrow(/malformed/i);
    expect(() => deriveSolanaSeed('0xdeadbeef')).toThrow(/malformed/i);
    expect(() => deriveSolanaSeed('not-hex-at-all')).toThrow(/malformed/i);
    // 63 hex chars — one short of a key.
    expect(() => deriveSolanaSeed('a'.repeat(63))).toThrow(/malformed/i);
    // 65 chars — one over.
    expect(() => deriveSolanaSeed('a'.repeat(65))).toThrow(/malformed/i);
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
