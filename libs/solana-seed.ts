// Pure ed25519 seed derivation for the user's Solana wallet.
//
// Deliberately free of any @solana/web3.js import so it stays testable: that
// package resolves to ESM (@solana/codecs-numbers/dist/index.native.mjs) which
// jest's transformIgnorePatterns does not transform, so a test touching it
// fails to parse. Keypair construction lives in ./solana-derive.ts instead.
//
// The seed is DERIVED from the wallet's EVM private key rather than randomly
// generated, so it inherits the EVM wallet's recovery story: the EVM key is
// restored on any device from the encrypted seed in Supabase `user_wallets`
// (see wallet-core/store.ts), and this falls straight out of it. The previous
// Keypair.generate() key existed in exactly one place — one phone's keystore,
// excluded from backups by WHEN_UNLOCKED_THIS_DEVICE_ONLY and absent from
// `user_wallets` — so reinstalling the app or losing the handset destroyed it
// permanently, and the recovery phrase could not bring it back. Anything at
// that address (the SOL deposited to pay mint fees, plus the rent locked in
// every mint account) went with it.
//
// HKDF-SHA512 with a fixed info string domain-separates this from every other
// use of the same private key, and its 32-byte output is exactly the ed25519
// seed Keypair.fromSeed expects.
import { hkdf } from "@noble/hashes/hkdf";
import { sha512 } from "@noble/hashes/sha2";
import { Buffer } from "buffer";

// Changing either constant changes every user's Solana address, stranding
// whatever is at the old one. They must not move.
const SOLANA_HKDF_INFO = "DeHub Solana ed25519 v1";
const SOLANA_HKDF_SALT = "DeHub Solana derivation salt v1";

const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "utf8"));

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 32-byte ed25519 seed for the Solana wallet belonging to an EVM private key.
 * The same input always produces the same seed, on any device.
 */
export function deriveSolanaSeed(evmPrivateKey: string): Uint8Array {
  const clean = evmPrivateKey.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error("Cannot derive Solana wallet: malformed EVM private key");
  }
  return hkdf(
    sha512,
    hexToBytes(clean),
    utf8(SOLANA_HKDF_SALT),
    utf8(SOLANA_HKDF_INFO),
    32,
  );
}
