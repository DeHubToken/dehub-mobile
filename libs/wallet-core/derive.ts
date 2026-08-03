// Derives the ETH keypair from a BIP-39 mnemonic (or a raw private key) —
// mobile counterpart of dehubweb's src/lib/wallet-core/derive.ts. Same
// derivation path (m/44'/60'/0'/0/0), so the same mnemonic produces the same
// address on both clients. Ported against ethers v5 (this app's installed
// version) rather than v6's HDNodeWallet API the web client uses.
import { ethers } from "ethers";

export const ETH_PATH = "m/44'/60'/0'/0/0";

export interface DerivedWallet {
  /** The secret the wallet was derived from: a mnemonic phrase or 0x private key. */
  secret: string;
  ethAddress: string;
  ethPrivateKey: string; // 0x-prefixed hex
}

export function generateMnemonic12(): string {
  // 128 bits of entropy -> 12 words
  return ethers.utils.entropyToMnemonic(ethers.utils.randomBytes(16));
}

export function isValidMnemonic(phrase: string): boolean {
  try {
    ethers.Wallet.fromMnemonic(phrase.trim().toLowerCase());
    return true;
  } catch {
    return false;
  }
}

/** Raw 32-byte hex private key, with or without 0x prefix. */
export function isRawPrivateKey(secret: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(secret.trim());
}

/**
 * Derive the ETH account from a stored wallet secret. Accepts either a
 * BIP-39 mnemonic (normal path) or a raw hex private key (migration path for
 * keys exported from the old Web3Auth wallets).
 */
export function deriveFromSecret(rawSecret: string): DerivedWallet {
  const trimmed = rawSecret.trim();

  if (isRawPrivateKey(trimmed)) {
    const pk = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    const wallet = new ethers.Wallet(pk);
    return { secret: pk, ethAddress: wallet.address, ethPrivateKey: wallet.privateKey };
  }

  const mnemonic = trimmed.toLowerCase();
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid recovery phrase");
  }
  const wallet = ethers.Wallet.fromMnemonic(mnemonic, ETH_PATH);
  return { secret: mnemonic, ethAddress: wallet.address, ethPrivateKey: wallet.privateKey };
}
