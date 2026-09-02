/**
 * Primitives for end-to-end encrypted direct messages.
 *
 * Shared contract with dehubweb `src/lib/dm-e2ee/crypto.ts` — the two files
 * must stay behaviourally identical, because a message encrypted on one
 * platform is decrypted on the other. Every constant below is part of the
 * wire format; changing one strands every message already sent.
 *
 *   identity  = X25519 keypair derived from a wallet signature over a fixed
 *               message (so the same wallet regenerates the same keys on any
 *               device — nothing to back up, nothing to sync).
 *   session   = HKDF-SHA256(X25519(myPriv, theirPub), info = both addresses)
 *   message   = XChaCha20-Poly1305(session, random 24-byte nonce)
 *   envelope  = "e2e:1:<nonce b64>:<ciphertext b64>" stored in `content`,
 *               so old plaintext rows and new encrypted rows share a column
 *               and the server needs no schema change to carry both.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import * as ExpoCrypto from "expo-crypto";
import { Buffer } from "buffer";

export const E2EE_PREFIX = "e2e:";
export const E2EE_VERSION = 1;

const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "utf8"));

const SALT = utf8("dehub-dm-e2ee-v1");
const IDENTITY_INFO = utf8("x25519-identity");
const AAD = utf8("dehub-dm-v1");
const NONCE_BYTES = 24;

// Native CSPRNG, same reasoning as libs/wallet-core/crypto.ts: never depend on
// a polyfilled global for nonce material.
function randomBytes(n: number): Uint8Array {
  return ExpoCrypto.getRandomBytes(n);
}

/**
 * The exact text the wallet signs. Fixed (no timestamp, no nonce) on purpose:
 * the signature IS the key material, so it has to come out the same every
 * time. It contains nothing a relayer could replay as an authorisation.
 */
export function encryptionSignMessage(address: string): string {
  return (
    "DeHub Messages\n\n" +
    `Sign to unlock end-to-end encrypted messages for ${address.toLowerCase()}.\n\n` +
    "This signature only derives your message keys on this device. " +
    "It costs nothing and does not authorise any transaction."
  );
}

export interface IdentityKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64.trim(), "base64"));
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("Malformed hex signature");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Wallet signature (0x hex) → X25519 identity keypair. Deterministic. */
export function deriveIdentityFromSignature(signatureHex: string): IdentityKeyPair {
  const seed = sha256(hexToBytes(signatureHex));
  const privateKey = hkdf(sha256, seed, SALT, IDENTITY_INFO, 32);
  seed.fill(0);
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

/** True when a public key string is a well-formed 32-byte X25519 key. */
export function isValidPublicKey(b64: string | null | undefined): b64 is string {
  if (!b64 || typeof b64 !== "string") return false;
  try {
    return fromBase64(b64).length === 32;
  } catch {
    return false;
  }
}

/**
 * Per-conversation symmetric key. Symmetric in the two parties: A with B's
 * public key and B with A's derive the same bytes, which is what lets either
 * side decrypt messages the other sent as well as its own.
 */
export function deriveSessionKey(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
  myAddress: string,
  theirAddress: string,
): Uint8Array {
  const shared = x25519.getSharedSecret(myPrivateKey, theirPublicKey);
  const pair = [myAddress.toLowerCase(), theirAddress.toLowerCase()].sort();
  const info = utf8(`dm:${pair[0]}:${pair[1]}`);
  const key = hkdf(sha256, shared, SALT, info, 32);
  shared.fill(0);
  return key;
}

export function isEncryptedContent(content: string | null | undefined): boolean {
  return typeof content === "string" && content.startsWith(E2EE_PREFIX);
}

export function encryptText(plaintext: string, sessionKey: Uint8Array): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = xchacha20poly1305(sessionKey, nonce, AAD);
  const ct = cipher.encrypt(utf8(plaintext));
  return `${E2EE_PREFIX}${E2EE_VERSION}:${toBase64(nonce)}:${toBase64(ct)}`;
}

/** Throws on a malformed envelope, a wrong key, or a tampered ciphertext. */
export function decryptText(envelope: string, sessionKey: Uint8Array): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== "e2e") throw new Error("Not an encrypted envelope");
  if (Number(parts[1]) !== E2EE_VERSION) throw new Error(`Unsupported envelope version ${parts[1]}`);
  const nonce = fromBase64(parts[2]);
  const ct = fromBase64(parts[3]);
  if (nonce.length !== NONCE_BYTES) throw new Error("Bad nonce length");
  const cipher = xchacha20poly1305(sessionKey, nonce, AAD);
  return Buffer.from(cipher.decrypt(ct)).toString("utf8");
}
