// AES-256-GCM authenticated encryption for wallet secrets — mobile port.
//
// This is the counterpart to dehubweb's src/lib/wallet-core/crypto.ts and MUST
// stay byte-compatible with it: the same encrypted_seed row is read by both
// clients, so a wallet created on the web has to open on the phone and vice
// versa. The payload format, KDF parameters, header encoding and error strings
// are all deliberately identical. Changing any of them here without changing
// the web side breaks cross-device access to funds.
//
// WHY NOT THE SAME CODE: the web build derives keys with `hash-wasm` (Argon2id
// compiled to WebAssembly) and encrypts with WebCrypto's `crypto.subtle`.
// Hermes runs neither — no WASM, and no SubtleCrypto. So the primitives here
// come from @noble, which is pure JavaScript:
//
//   Argon2id  @noble/hashes/argon2   — verified byte-identical to hash-wasm
//   PBKDF2    @noble/hashes/pbkdf2   — legacy wallets only
//   HKDF      @noble/hashes/hkdf     — high-entropy key material
//   AES-GCM   @noble/ciphers/aes     — verified byte-identical to crypto.subtle
//
// KDFs supported:
//  - argon2id (default for all PASSWORD-protected wallets — memory-hard, GPU-resistant)
//  - hkdf     (for high-entropy key material, e.g. a biometric-held wrap key)
//  - pbkdf2   (legacy; kept so wallets created before the upgrade still decrypt)
//
// On-disk layout: `{ ciphertext, salt, iv, iterations }`, where Argon2id and
// HKDF payloads pack their KDF parameters into a header prefixed to the base64
// ciphertext:
//
//     "v2:" + base64url(JSON.stringify({ kdf, ... })) + ":" + base64(cipher)
//
// Legacy PBKDF2 payloads have no prefix and use `payload.iterations` directly.
// `payload.iterations` is 0 for Argon2id/HKDF rows so nothing reads it as a
// PBKDF2 count by accident.
//
// Password stretching (Argon2id/PBKDF2) and key-material derivation (HKDF) are
// deliberately separate entry points: a password MUST be stretched, while a
// 32-byte random wrap key is already uniformly random and only needs expanding.
// Feeding one to the other's function is a security bug, so each path rejects
// the other's payloads instead of silently guessing.
import { argon2idAsync } from "@noble/hashes/argon2";
import { hkdf } from "@noble/hashes/hkdf";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { gcm } from "@noble/ciphers/aes";
import { Buffer } from "buffer";
import * as ExpoCrypto from "expo-crypto";
import { nativeArgon2id } from "./native-argon2";

// PBKDF2 legacy default (OWASP 2023 baseline for SHA-256).
const PBKDF2_ITERATIONS_DEFAULT = 600_000;

// Argon2id defaults — must match the web client exactly, or a wallet created
// here would need different parameters to open there. Parameters are stored
// per-payload in the v2 header, so existing wallets keep decrypting with
// whatever they were created with; only NEW wallets get these.
const ARGON2_MEMORY_KIB = 65_536; // 64 MiB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;

// Argon2id at 64 MiB × 3 passes takes tens of seconds in pure JS on Hermes
// (no WASM, no JIT — the web client's hash-wasm build does the same work in
// ~hundreds of ms). The async variant yields to the event loop every
// `asyncTick` ms so touches keep processing and the busy spinner can render;
// note this only actually yields with our @noble/hashes patch (see
// patches/@noble+hashes+*.patch) — upstream's nextTick is a microtask no-op
// that never returns control to the host, which read as a full app freeze.
// 100ms rather than something frame-rate-ish because each yield costs up to
// a frame in RN's timer scheduling: at 16ms the KDF spent as long waiting as
// working (~2x total time), while at 100ms the overhead is ~15% and the
// native-driven ActivityIndicator animates on the UI thread regardless.
const ARGON2_ASYNC_TICK_MS = 100;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const V2_PREFIX = "v2:";

// Domain separation for the HKDF expand step, so the same key material used for
// any other purpose can never yield this wrap key. Must match the web value.
const HKDF_INFO = "DeHub wallet seed wrap v1";

const utf8 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "utf8"));
const fromUtf8 = (b: Uint8Array): string => Buffer.from(b).toString("utf8");

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

// Built on plain "base64" rather than Buffer's "base64url" encoding: the RN
// `buffer` polyfill (v6.0.3, as installed here) does not implement
// "base64url" at all — Buffer.from(str, "base64url") throws "Unknown
// encoding: base64url" — which parseCiphertext's catch block was silently
// turning into a misleading "Corrupted wallet payload" for every payload,
// on every password, regardless of correctness. Standard base64 + the usual
// URL-safe substitution (+/  -> -_, strip padding) is exactly what
// "base64url" means, so this produces byte-identical output to the web
// client's btoa-based version without depending on polyfill support.
function base64UrlEncode(str: string): string {
  const b64 = Buffer.from(str, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function randomBytes(n: number): Uint8Array {
  // Native CSPRNG. Used directly rather than global crypto.getRandomValues so
  // this does not depend on a polyfill having been imported first — a silently
  // missing polyfill would be catastrophic here.
  return ExpoCrypto.getRandomBytes(n);
}

interface Argon2Header {
  kdf: "argon2id";
  m: number; // memory KiB
  t: number; // iterations
  p: number; // parallelism
}

interface HkdfHeader {
  kdf: "hkdf";
  h: "SHA-256";
}

type V2Header = Argon2Header | HkdfHeader;

async function deriveKeyPbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  return await pbkdf2Async(sha256, utf8(password), salt, { c: iterations, dkLen: 32 });
}

async function deriveKeyArgon2id(
  password: string,
  salt: Uint8Array,
  header: Argon2Header,
): Promise<Uint8Array> {
  // Native fast path (reference C implementation): ~hundreds of ms instead
  // of tens of seconds. Only active once its output has been byte-verified
  // against @noble this session — see native-argon2.ts; null means "use the
  // proven JS path", never an error.
  const fast = await nativeArgon2id(password, salt, {
    m: header.m,
    t: header.t,
    p: header.p,
    dkLen: 32,
  });
  if (fast) return fast;
  return await argon2idAsync(utf8(password), salt, {
    m: header.m,
    t: header.t,
    p: header.p,
    dkLen: 32,
    asyncTick: ARGON2_ASYNC_TICK_MS,
  });
}

function deriveKeyHkdf(keyMaterial: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, keyMaterial, salt, utf8(HKDF_INFO), 32);
}

export interface EncryptedPayload {
  ciphertext: string; // base64 (may be prefixed with "v2:<header>:")
  salt: string; // base64
  iv: string; // base64
  iterations: number; // legacy PBKDF2 iteration count; 0 for Argon2id/HKDF rows
}

function parseCiphertext(ciphertext: string): { header: V2Header | null; body: string } {
  if (!ciphertext.startsWith(V2_PREFIX)) return { header: null, body: ciphertext };
  const rest = ciphertext.slice(V2_PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0) throw new Error("Corrupted wallet payload");
  const headerB64 = rest.slice(0, idx);
  const body = rest.slice(idx + 1);
  let parsed: V2Header;
  try {
    parsed = JSON.parse(base64UrlDecode(headerB64)) as V2Header;
  } catch {
    throw new Error("Corrupted wallet payload");
  }
  // A header we can parse but whose KDF we don't implement is a DIFFERENT
  // failure from corruption — most likely a payload written by a newer client.
  // Reporting it as corruption would send the user to a data-loss message for
  // an intact wallet, so keep the two distinguishable.
  if (parsed?.kdf !== "argon2id" && parsed?.kdf !== "hkdf") {
    throw new Error("This wallet was saved by a newer version of DeHub. Please reload and try again.");
  }
  return { header: parsed, body };
}

/** AES-GCM seal, shared by every KDF path. */
function aesEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: string): Uint8Array {
  return gcm(key, iv).encrypt(utf8(plaintext));
}

/** AES-GCM open, shared by every KDF path. Throws if the tag does not verify. */
function aesDecrypt(key: Uint8Array, iv: Uint8Array, ct: Uint8Array): string {
  return fromUtf8(gcm(key, iv).decrypt(ct));
}

export async function encryptString(
  plaintext: string,
  password: string,
): Promise<EncryptedPayload> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);

  const header: Argon2Header = {
    kdf: "argon2id",
    m: ARGON2_MEMORY_KIB,
    t: ARGON2_ITERATIONS,
    p: ARGON2_PARALLELISM,
  };
  const key = await deriveKeyArgon2id(password, salt, header);
  try {
    const cipherB64 = bytesToBase64(aesEncrypt(key, iv, plaintext));
    return {
      ciphertext: `${V2_PREFIX}${base64UrlEncode(JSON.stringify(header))}:${cipherB64}`,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      iterations: 0, // sentinel: KDF params live inside the ciphertext header
    };
  } finally {
    key.fill(0);
  }
}

export async function decryptString(payload: EncryptedPayload, password: string): Promise<string> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const { header, body } = parseCiphertext(payload.ciphertext);
  const ct = base64ToBytes(body);

  if (header?.kdf === "hkdf") {
    // Biometric-wrapped payload handed to the password path — no password can
    // ever open it, so say so plainly instead of reporting a wrong password.
    throw new Error("This wallet copy is unlocked with biometrics, not a password.");
  }

  // Explicit rather than relying on narrowing: no header at all means a legacy
  // PBKDF2 payload, which reads its iteration count from the row.
  const argonHeader = header?.kdf === "argon2id" ? header : null;
  const key = argonHeader
    ? await deriveKeyArgon2id(password, salt, argonHeader)
    : await deriveKeyPbkdf2(password, salt, payload.iterations || PBKDF2_ITERATIONS_DEFAULT);

  try {
    return aesDecrypt(key, iv, ct);
  } catch {
    throw new Error("Incorrect password or corrupted data");
  } finally {
    key.fill(0);
  }
}

/**
 * Encrypt under high-entropy key material rather than a password. No password
 * stretching: the input is already 32 uniformly random bytes, so HKDF-expand is
 * both sufficient and instant — which is the whole point of the biometric
 * unlock path.
 */
export async function encryptStringWithKeyMaterial(
  plaintext: string,
  keyMaterial: Uint8Array,
): Promise<EncryptedPayload> {
  if (keyMaterial.length < 32) {
    throw new Error("Key material too short — refusing to encrypt the wallet seed");
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);

  const header: HkdfHeader = { kdf: "hkdf", h: "SHA-256" };
  const key = deriveKeyHkdf(keyMaterial, salt);
  try {
    return {
      ciphertext: `${V2_PREFIX}${base64UrlEncode(JSON.stringify(header))}:${bytesToBase64(
        aesEncrypt(key, iv, plaintext),
      )}`,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      iterations: 0,
    };
  } finally {
    key.fill(0);
  }
}

/** Counterpart to encryptStringWithKeyMaterial. */
export async function decryptStringWithKeyMaterial(
  payload: EncryptedPayload,
  keyMaterial: Uint8Array,
): Promise<string> {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const { header, body } = parseCiphertext(payload.ciphertext);
  const ct = base64ToBytes(body);

  if (header?.kdf !== "hkdf") {
    // Password-wrapped payload handed to the biometric path. This would
    // otherwise expand the wrap key as if it were a password and fail with a
    // misleading "incorrect password".
    throw new Error("This wallet copy is unlocked with a password, not biometrics.");
  }

  const key = deriveKeyHkdf(keyMaterial, salt);
  try {
    return aesDecrypt(key, iv, ct);
  } catch {
    // Deliberately says nothing about what to do next: only the caller knows
    // whether this wallet even has a password to fall back to.
    throw new Error("This passkey can't unlock this wallet.");
  } finally {
    key.fill(0);
  }
}

/**
 * Re-encrypt an already-decrypted secret with the current default KDF
 * (Argon2id). Used to silently upgrade old PBKDF2 wallets on next unlock.
 */
export async function reEncryptString(plaintext: string, password: string): Promise<EncryptedPayload> {
  return encryptString(plaintext, password);
}

/** True for wallets still using the legacy PBKDF2 KDF. */
export function isLegacyPayload(payload: EncryptedPayload): boolean {
  return !payload.ciphertext.startsWith(V2_PREFIX);
}

/**
 * Which KDF protects this payload, WITHOUT needing the password/key material
 * to decrypt it — the header carries this openly. Callers use this to route
 * to the right unlock UI (password prompt vs biometric one-tap) before
 * asking the user for anything.
 */
export function getPayloadKdf(payload: EncryptedPayload): "argon2id" | "hkdf" | "pbkdf2" {
  if (!payload.ciphertext.startsWith(V2_PREFIX)) return "pbkdf2";
  try {
    const { header } = parseCiphertext(payload.ciphertext);
    if (header?.kdf === "hkdf") return "hkdf";
    return "argon2id";
  } catch {
    // Corrupted/unknown v2 header — not a determination we can make; treat as
    // the password path so the real error surfaces from an actual unlock
    // attempt instead of being swallowed here.
    return "argon2id";
  }
}

export const DEFAULT_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_DEFAULT;
