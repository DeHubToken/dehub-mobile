// Mirrors dehubweb's src/lib/dm-e2ee/__tests__/crypto.test.ts. The pinned
// values are the wire contract between the two apps: a message encrypted on
// web must open on mobile and vice versa, so both suites assert the same
// public keys, session key and envelope from the same fixed inputs.
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => new Uint8Array(require("crypto").randomBytes(n)),
}));

import {
  decryptText,
  deriveIdentityFromSignature,
  deriveSessionKey,
  encryptText,
  encryptionSignMessage,
  fromBase64,
  isEncryptedContent,
  isValidPublicKey,
  toBase64,
} from "../../libs/dm-e2ee/crypto";

const SIG_A = "0x" + "ab".repeat(65);
const SIG_B = "0x" + "cd".repeat(65);
const ADDR_A = "0x1111111111111111111111111111111111111111";
const ADDR_B = "0x2222222222222222222222222222222222222222";
const PUB_A = "Ra/MCfbmaKx0ZTupqV7yMpN41gJWdMjGCG8BgGKTOno=";
const PUB_B = "OrYD/NRFBbAJ5uLO9YH/J8ReXDl0tlMEH5X3f/xrSCo=";
const SESSION = "jINaabfUU93u0r04mRFqKeRrUtxfWCgvceI/fHzsAwc=";
const ENVELOPE = "e2e:1:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH:UIHnN+x3J9XRQggeOgHxU6HV1xDeDKEItCGZGrmnCyg=";
const PLAINTEXT = "hello dehub 🔒";

describe("dm-e2ee crypto", () => {
  it("derives the same identity from the same signature, and the pinned public keys", () => {
    const a1 = deriveIdentityFromSignature(SIG_A);
    const a2 = deriveIdentityFromSignature(SIG_A);
    expect(toBase64(a1.privateKey)).toBe(toBase64(a2.privateKey));
    expect(toBase64(a1.publicKey)).toBe(PUB_A);
    expect(toBase64(deriveIdentityFromSignature(SIG_B).publicKey)).toBe(PUB_B);
  });

  it("derives one symmetric session key from either side", () => {
    const a = deriveIdentityFromSignature(SIG_A);
    const b = deriveIdentityFromSignature(SIG_B);
    const fromA = deriveSessionKey(a.privateKey, b.publicKey, ADDR_A, ADDR_B);
    const fromB = deriveSessionKey(b.privateKey, a.publicKey, ADDR_B, ADDR_A);
    expect(toBase64(fromA)).toBe(SESSION);
    expect(toBase64(fromB)).toBe(SESSION);
    expect(toBase64(deriveSessionKey(a.privateKey, b.publicKey, ADDR_A.toUpperCase(), ADDR_B))).toBe(SESSION);
  });

  it("opens the pinned envelope and round-trips fresh ones", () => {
    const key = fromBase64(SESSION);
    expect(decryptText(ENVELOPE, key)).toBe(PLAINTEXT);
    const fresh = encryptText(PLAINTEXT, key);
    expect(isEncryptedContent(fresh)).toBe(true);
    expect(fresh).not.toBe(ENVELOPE);
    expect(decryptText(fresh, key)).toBe(PLAINTEXT);
  });

  it("rejects a tampered ciphertext, a wrong key and a foreign envelope", () => {
    const key = fromBase64(SESSION);
    const parts = ENVELOPE.split(":");
    const ct = fromBase64(parts[3]);
    ct[0] ^= 1;
    expect(() => decryptText(`${parts[0]}:${parts[1]}:${parts[2]}:${toBase64(ct)}`, key)).toThrow();
    const other = deriveSessionKey(
      deriveIdentityFromSignature(SIG_A).privateKey,
      deriveIdentityFromSignature(SIG_B).publicKey,
      ADDR_A,
      "0x3333333333333333333333333333333333333333",
    );
    expect(() => decryptText(ENVELOPE, other)).toThrow();
    expect(() => decryptText("e2e:2:AAAA:BBBB", key)).toThrow();
    expect(isEncryptedContent("plain text")).toBe(false);
  });

  it("validates public keys and keeps the sign message fixed", () => {
    expect(isValidPublicKey(PUB_A)).toBe(true);
    expect(isValidPublicKey("not-a-key")).toBe(false);
    expect(isValidPublicKey(toBase64(new Uint8Array(31)))).toBe(false);
    expect(encryptionSignMessage(ADDR_A.toUpperCase())).toBe(encryptionSignMessage(ADDR_A));
    expect(encryptionSignMessage(ADDR_A)).toContain(ADDR_A);
  });
});
