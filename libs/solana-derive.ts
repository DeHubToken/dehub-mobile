// Solana keypair construction on top of the pure seed derivation.
//
// The HKDF work and the hex helpers live in ./solana-seed.ts, which imports no
// @solana/web3.js — that package resolves to ESM jest cannot parse, so keeping
// the two apart is what lets the derivation be unit tested. See that file for
// why the key is derived rather than generated.
//
// This is deliberately not the BIP44 m/44'/501'/0'/0' path Phantom uses: the
// mnemonic is not held on device, only the derived EVM private key is (the
// seed lives encrypted behind the wallet password). Deriving from the key we
// actually have keeps the address reproducible without forcing a password
// unlock on every Solana signature. The consequence is that the recovery
// phrase alone will not reproduce this address in Phantom; the wallet is
// recoverable through DeHub sign-in, the same way the EVM wallet is.
import { Keypair } from "@solana/web3.js";
import { deriveSolanaSeed } from "./solana-seed";

export { bytesToHex, deriveSolanaSeed, hexToBytes } from "./solana-seed";

/**
 * Derive the Solana keypair for a wallet from its EVM private key.
 * Same input always yields the same keypair, on any device.
 */
export function deriveSolanaKeypair(evmPrivateKey: string): Keypair {
  return Keypair.fromSeed(deriveSolanaSeed(evmPrivateKey));
}

/** Base58 Solana address for a wallet, derived from its EVM private key. */
export function deriveSolanaAddress(evmPrivateKey: string): string {
  return deriveSolanaKeypair(evmPrivateKey).publicKey.toBase58();
}
