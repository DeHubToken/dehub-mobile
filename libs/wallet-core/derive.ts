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

/**
 * Collapse the whitespace a real recovery phrase arrives wrapped in.
 *
 * ethers v5 splits a mnemonic on `/ +/g` — literal spaces only — so a phrase
 * pasted from a notes app where it was saved three words per line, or copied
 * out of a document that used non-breaking spaces, is rejected as invalid
 * despite being exactly right. That reads to the user as "my backup doesn't
 * work", on the one screen where the phrase is the last way back into the
 * account, so it has to be handled here rather than at each call site.
 */
function normalizePhrase(phrase: string): string {
  return (phrase ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isValidMnemonic(phrase: string): boolean {
  try {
    ethers.Wallet.fromMnemonic(normalizePhrase(phrase));
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

  const mnemonic = normalizePhrase(trimmed);
  if (!isValidMnemonic(mnemonic)) {
    throw new Error("Invalid recovery phrase");
  }
  const wallet = ethers.Wallet.fromMnemonic(mnemonic, ETH_PATH);
  return { secret: mnemonic, ethAddress: wallet.address, ethPrivateKey: wallet.privateKey };
}

/**
 * What the one Import field holds: a raw private key, a 12/24-word recovery
 * phrase, or neither. The phrase check is ethers' wordlist + checksum test,
 * which is cheap enough for every keystroke — isValidMnemonic derives a
 * whole wallet to answer the same question.
 */
export function importSecretKind(input: string): "key" | "phrase" | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  if (isRawPrivateKey(value)) return "key";
  const phrase = normalizePhrase(value);
  const words = phrase.split(" ").length;
  if ((words === 12 || words === 24) && ethers.utils.isValidMnemonic(phrase)) return "phrase";
  return null;
}

/**
 * The 0x private key an Import field's contents stand for. A phrase is
 * derived on the same path as a DeHub-created wallet, so importing its words
 * lands on the same address. Throws on anything else.
 */
export function privateKeyFromImportSecret(input: string): string {
  const kind = importSecretKind(input);
  if (kind === "key") {
    const key = input.trim();
    return key.startsWith("0x") ? key : `0x${key}`;
  }
  if (kind === "phrase" && isValidMnemonic(input)) {
    return deriveFromSecret(input).ethPrivateKey;
  }
  throw new Error("Invalid recovery phrase or private key");
}
