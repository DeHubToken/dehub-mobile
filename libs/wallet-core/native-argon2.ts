// Native Argon2id fast path — react-native-argon2 wraps the reference C
// implementation (argon2kt on Android, Argon2Swift on iOS), which runs the
// 64 MiB × 3-pass derivation in ~hundreds of ms where the pure-JS @noble
// path takes tens of seconds on Hermes (no WASM, no JIT).
//
// SAFETY: the derived key encrypts/decrypts the wallet seed, so a native
// implementation that disagreed with @noble by even one byte would either
// lock users out ("incorrect password" on a correct password) or — far
// worse — write payloads the web client can never open. So the native path
// is only used after a one-time-per-session SELF-TEST: both implementations
// derive a small fixed vector and must agree byte-for-byte. Any mismatch,
// error, or missing native module (Expo Go, pre-rebuild dev client) falls
// back to the slow-but-proven @noble path silently.
import { argon2id } from "@noble/hashes/argon2";
import { Buffer } from "buffer";
import { createLogger } from "../logger";

const log = createLogger("native-argon2");

type NativeArgon2 = (
  password: string,
  salt: string,
  config: {
    iterations: number;
    memory: number; // KiB, same unit as the argon2 spec / @noble's `m`
    parallelism: number;
    hashLength: number;
    mode: "argon2i" | "argon2d" | "argon2id";
    saltEncoding: "utf8" | "hex";
  }
) => Promise<{ rawHash: string; encodedHash: string }>;

let native: NativeArgon2 | null = null;
try {
  // Throws when the native module isn't linked (Expo Go, or a dev client
  // built before this dependency was added) — JS fallback handles that.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("react-native-argon2");
  const fn = mod?.default ?? mod;
  if (typeof fn === "function") native = fn as NativeArgon2;
} catch {
  native = null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, "hex"));
}

let verification: Promise<boolean> | null = null;

/**
 * One-shot native-vs-@noble agreement check, memoized for the app session.
 * Uses deliberately tiny parameters (m=64 KiB) so the @noble side finishes
 * in milliseconds — correctness of the algorithm doesn't depend on the work
 * factor, so agreeing here means agreeing at the real 64 MiB parameters.
 */
function ensureVerified(): Promise<boolean> {
  if (!verification) {
    verification = (async () => {
      if (!native) return false;
      try {
        const password = "dehub-argon2-selftest";
        const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
        const params = { m: 64, t: 2, p: 1, dkLen: 32 };
        const res = await native(password, bytesToHex(salt), {
          iterations: params.t,
          memory: params.m,
          parallelism: params.p,
          hashLength: params.dkLen,
          mode: "argon2id",
          saltEncoding: "hex",
        });
        const expected = bytesToHex(
          argon2id(new Uint8Array(Buffer.from(password, "utf8")), salt, params)
        );
        const ok = res?.rawHash?.toLowerCase() === expected;
        if (ok) log.info("selftest:ok — native argon2 active");
        else log.warn("selftest:MISMATCH — native argon2 disabled", { got: res?.rawHash, expected });
        return ok;
      } catch (e) {
        log.warn("selftest:error — native argon2 disabled", e);
        return false;
      }
    })();
  }
  return verification;
}

/**
 * Derive an Argon2id key natively, or return null when the caller should use
 * the pure-JS path instead (module missing, self-test failed, native error).
 */
export async function nativeArgon2id(
  password: string,
  salt: Uint8Array,
  opts: { m: number; t: number; p: number; dkLen: number }
): Promise<Uint8Array | null> {
  if (!native) return null;
  if (!(await ensureVerified())) return null;
  try {
    const res = await native(password, bytesToHex(salt), {
      iterations: opts.t,
      memory: opts.m,
      parallelism: opts.p,
      hashLength: opts.dkLen,
      mode: "argon2id",
      saltEncoding: "hex",
    });
    const out = hexToBytes(res.rawHash);
    if (out.length !== opts.dkLen) {
      log.warn("nativeArgon2id:bad-output-length — falling back to JS", {
        got: out.length,
        want: opts.dkLen,
      });
      return null;
    }
    return out;
  } catch (e) {
    log.warn("nativeArgon2id:error — falling back to JS", e);
    return null;
  }
}
