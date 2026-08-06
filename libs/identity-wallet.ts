// Resolves the EVM wallet for a Supabase identity (Google/Email sign-in).
//
// The identity->address map (SecureStore, this device only) is a fast path so
// repeat logins on the SAME device skip the network round-trip. The source of
// truth for "does this identity already have a wallet" is the Supabase
// `user_wallets` table (see wallet-core/store.ts) — the same table the web
// client reads/writes — so an account created on the web (or on a different
// phone) is RECOVERED here instead of a new, unrelated wallet being minted.
// That table lookup, and the password unlock/creation it requires, is what
// makes this genuinely cross-device instead of merely per-device.
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import {
  upsertLocalAccount,
  hasPrivateKeyForAddress,
  getPrivateKeyForAddress,
} from "./wallets.local";
import { createLogger } from "./logger";
import {
  fetchWalletReliably,
  saveWallet,
  type StoredWallet,
} from "./wallet-core/store";
import { encryptString, getPayloadKdf, type EncryptedPayload } from "./wallet-core/crypto";
import { generateMnemonic12, deriveFromSecret } from "./wallet-core/derive";
import { enrollBiometricUnlock, hasBiometricWrapKey, unlockWithBiometrics } from "./wallet-core/biometric-unlock";
import { setupAAProvider } from "./wallet-core/smart-account";
import { getPreferredChainId } from "./auth.utils";
import { ChainId } from "../config/constants";

const log = createLogger("identity-wallet");

const EVM_MAP_KEY = "supabase_identity_wallet_map_v1";
const SOLANA_SK_PREFIX = "local_solana_sk_";

// THIS_DEVICE_ONLY keeps the Solana secret out of iCloud/Keychain sync and
// device backups, matching the accessibility level wallets.local.ts uses for
// EVM keys.
const KEY_ACCESSIBILITY = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

async function readMap(key: string): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMapEntry(key: string, id: string, value: string): Promise<void> {
  try {
    const map = await readMap(key);
    map[id] = value;
    await SecureStore.setItemAsync(key, JSON.stringify(map));
  } catch (e) {
    log.warn("writeMapEntry:error", { key, e });
  }
}

async function deleteMapEntry(key: string, id: string): Promise<void> {
  try {
    const map = await readMap(key);
    if (!(id in map)) return;
    delete map[id];
    await SecureStore.setItemAsync(key, JSON.stringify(map));
  } catch (e) {
    log.warn("deleteMapEntry:error", { key, e });
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export type EvmWalletResolution =
  // Local device already has the key — either the fast-path map hit, or the
  // Supabase row had no password payload and turned out to match a key we
  // already hold locally (e.g. re-resolving right after a create/unlock).
  | { status: "ready"; address: string; privateKey: string }
  // Supabase already has a wallet for this identity, protected by a
  // password. The caller must prompt for it and call finishWalletUnlock —
  // creating a new wallet here would silently orphan the user's real one.
  | { status: "needs-unlock"; address: string; payload: EncryptedPayload }
  // Supabase has a biometric/passkey-protected wallet (hkdf payload). If this
  // device enrolled the wrap key, one-tap unlock works; otherwise the unlock
  // UI falls back to wallet password.
  | { status: "needs-biometric-unlock"; address: string; payload: EncryptedPayload }
  // Web passkey/biometric wallet: address is in Supabase but encrypted_seed was
  // intentionally omitted (unlocks only in the browser via WebAuthn — not portable
  // to the phone's fingerprint). User must add a password backup on dehub.io.
  | { status: "needs-web-passkey-sync"; address: string }
  // No wallet exists anywhere for this identity yet — genuinely first login.
  // The caller must prompt to set up protection (password or biometric) and
  // call createAndSaveEvmWalletForIdentity.
  | { status: "needs-create-password" }
  // Supabase wallet lookup failed (network/RLS/transient). The caller must NOT
  // treat this as "no wallet" and mint a new one — try the backend session
  // exchange first, then retry or show unlock. Mirrors dehubweb's
  // proceedToWalletPhase catch, which defaults to unlock (not create) on
  // fetch failure so an existing wallet is never overwritten by accident.
  | { status: "wallet-lookup-failed" };

/**
 * Figures out what this Supabase identity's EVM wallet situation is, without
 * ever minting a wallet on the caller's behalf. See EvmWalletResolution for
 * what each outcome means and what the caller must do next.
 */
export async function resolveEvmWalletForIdentity(
  supabaseUserId: string,
): Promise<EvmWalletResolution> {
  // Authoritative cross-device source FIRST — same order as dehubweb's
  // proceedToWalletPhase → fetchWallet. The local identity→address map is
  // only a fast path when it agrees with this record; checking it before
  // Supabase is what made mobile open a different account than the website
  // for the same Google login (stale wallet created/tested on this phone
  // shadowed the real Supabase-linked one).
  const { wallet: remote, failed: fetchFailed } = await fetchWalletReliably(
    supabaseUserId
  );
  if (fetchFailed) {
    log.warn("resolveEvmWalletForIdentity:fetchWallet:exhausted-retries", {
      supabaseUserId: `${supabaseUserId.slice(0, 8)}...`,
    });
  }

  const map = await readMap(EVM_MAP_KEY);
  const cachedAddress = map[supabaseUserId]?.toLowerCase();

  const tryReady = async (address: string): Promise<EvmWalletResolution | null> => {
    if (!(await hasPrivateKeyForAddress(address))) return null;
    const pk = await getPrivateKeyForAddress(address, {
      purpose: "Sign in to DeHub",
    });
    if (!pk) return null;
    return { status: "ready", address, privateKey: pk };
  };

  if (remote) {
    const remoteAddr = remote.ethAddress?.toLowerCase?.();
    if (!remoteAddr) {
      log.warn("resolveEvmWalletForIdentity:remote-row-missing-address", { supabaseUserId });
      if (fetchFailed) return { status: "wallet-lookup-failed" };
      return { status: "needs-create-password" };
    }
    if (cachedAddress && cachedAddress !== remoteAddr) {
      log.warn("resolveEvmWalletForIdentity:stale-local-map-cleared", {
        cached: `${cachedAddress.slice(0, 6)}...${cachedAddress.slice(-4)}`,
        canonical: `${remoteAddr.slice(0, 6)}...${remoteAddr.slice(-4)}`,
      });
      await deleteMapEntry(EVM_MAP_KEY, supabaseUserId);
    }

    const ready = await tryReady(remoteAddr);
    if (ready) return ready;

    if (remote.payload) {
      const kdf = getPayloadKdf(remote.payload);
      // eslint-disable-next-line no-console
      console.error("[resolveEvmWallet] cloud payload", { kdf, address: `${remoteAddr.slice(0, 6)}...` });
      if (kdf === "hkdf") {
        const hasWrap = await hasBiometricWrapKey(remoteAddr);
        // eslint-disable-next-line no-console
        console.error("[resolveEvmWallet] hkdf wallet", {
          address: `${remoteAddr.slice(0, 6)}...`,
          hasDeviceWrapKey: hasWrap,
        });
        return { status: "needs-biometric-unlock", address: remoteAddr, payload: remote.payload };
      }
      return { status: "needs-unlock", address: remoteAddr, payload: remote.payload };
    }
    // eslint-disable-next-line no-console
    console.error("[resolveEvmWallet] web passkey wallet — no cloud seed row", {
      address: `${remoteAddr.slice(0, 6)}...`,
    });
    return { status: "needs-web-passkey-sync", address: remoteAddr };
  }

  if (fetchFailed) {
    return { status: "wallet-lookup-failed" };
  }

  // No Supabase row — never trust a device-only cache; the backend may still
  // recognize this identity via web3AuthMeta (session exchange handles that).
  if (cachedAddress) {
    log.warn("resolveEvmWalletForIdentity:orphan-local-cache-ignored", {
      cached: `${cachedAddress.slice(0, 6)}...${cachedAddress.slice(-4)}`,
    });
    await deleteMapEntry(EVM_MAP_KEY, supabaseUserId);
  }

  return { status: "needs-create-password" };
}

/** Supabase-stored wallet address when resolution already knows one. */
export function getKnownWalletAddress(resolution: EvmWalletResolution): string | undefined {
  switch (resolution.status) {
    case "ready":
    case "needs-unlock":
    case "needs-biometric-unlock":
    case "needs-web-passkey-sync":
      return resolution.address;
    default:
      return undefined;
  }
}

/**
 * Completes the "needs-unlock" path: the caller has already decrypted the
 * Supabase payload (via wallet-core/crypto's decryptString) and derived the
 * keypair (via wallet-core/derive's deriveFromSecret) using the password the
 * user entered. This just persists the result locally so future logins on
 * this device hit the fast path instead of unlocking again.
 */
export async function finishWalletUnlock(
  supabaseUserId: string,
  address: string,
  privateKey: string,
): Promise<void> {
  await upsertLocalAccount({ address, privateKey });
  await writeMapEntry(EVM_MAP_KEY, supabaseUserId, address.toLowerCase());
}

/**
 * Completes the "needs-biometric-unlock" path: decrypts the Supabase payload
 * using this device's stored wrap key (biometric/passcode-gated), derives
 * the keypair, and persists it locally the same way finishWalletUnlock does.
 */
export async function finishBiometricUnlock(
  supabaseUserId: string,
  address: string,
  payload: EncryptedPayload,
): Promise<{ address: string; privateKey: string }> {
  const secret = await unlockWithBiometrics(address, payload);
  const derived = deriveFromSecret(secret);
  await finishWalletUnlock(supabaseUserId, derived.ethAddress, derived.ethPrivateKey);
  return { address: derived.ethAddress, privateKey: derived.ethPrivateKey };
}

/**
 * Completes the "needs-create-password" path: generates a brand-new
 * mnemonic-derived wallet (matching the web client's derivation, so a future
 * `deriveFromSecret` on either platform agrees), protects it, and saves it to
 * Supabase — so THIS is the wallet that gets recovered elsewhere, not
 * silently orphaned there.
 *
 * `protection: "password"` encrypts with Argon2id under `secret` (a
 * password) — recoverable on ANY device that knows it. `"biometric"`
 * encrypts with this device's wrap key under HKDF — recoverable ONLY from
 * this device (see wallet-core/biometric-unlock.ts), trading that away for
 * skipping the slow Argon2id derivation entirely.
 *
 * `existingSecret` re-protects and re-saves an already-generated wallet
 * instead of minting a new mnemonic — for retrying after a create attempt
 * whose Supabase save succeeded but whose DeHub sign-in failed. Generating
 * fresh on retry would overwrite the just-saved user_wallets row with a
 * different wallet, orphaning the first one (and any backend account link it
 * acquired).
 */
export async function createAndSaveEvmWalletForIdentity(
  supabaseUserId: string,
  protection: { kind: "password"; password: string } | { kind: "biometric" },
  existingSecret?: string,
): Promise<{ address: string; privateKey: string; secret: string }> {
  const mnemonic = existingSecret ?? generateMnemonic12();
  const derived = deriveFromSecret(mnemonic);
  const encrypted =
    protection.kind === "password"
      ? await encryptString(derived.secret, protection.password)
      : await enrollBiometricUnlock(derived.ethAddress, derived.secret);
  await saveWallet(supabaseUserId, derived.ethAddress, encrypted);
  await upsertLocalAccount({ address: derived.ethAddress, privateKey: derived.ethPrivateKey });
  await writeMapEntry(EVM_MAP_KEY, supabaseUserId, derived.ethAddress.toLowerCase());
  log.info("createAndSaveEvmWalletForIdentity:created", {
    address: `${derived.ethAddress.slice(0, 6)}...${derived.ethAddress.slice(-4)}`,
    protection: protection.kind,
    reusedSecret: !!existingSecret,
  });
  return { address: derived.ethAddress, privateKey: derived.ethPrivateKey, secret: derived.secret };
}

/**
 * Drop THIS DEVICE's cached identity->address mapping for a Supabase
 * identity, without touching Supabase's user_wallets row (the actual
 * canonical record) or the locally-stored key itself (still recoverable via
 * Export Private Key if needed later — it just stops being auto-selected).
 *
 * Fixes the case where this fast path (see resolveEvmWalletForIdentity)
 * cached the WRONG address for this identity — e.g. a wallet created/tested
 * on this phone before it was ever linked to Supabase, which then
 * permanently shadowed the real, Supabase-linked account on every later
 * Google/email login, since the fast path is checked BEFORE Supabase and
 * never re-validates against it. Dropping the entry forces the next
 * resolveEvmWalletForIdentity call to fall through to fetchWallet(userId) —
 * the same cross-device source of truth the web client always reads —
 * instead of trusting this device's possibly-stale local memory.
 */
export async function forgetLocalWalletForIdentity(supabaseUserId: string): Promise<void> {
  await deleteMapEntry(EVM_MAP_KEY, supabaseUserId);
  log.info("forgetLocalWalletForIdentity:cleared", { supabaseUserId: `${supabaseUserId.slice(0, 8)}...` });
}

/**
 * Replace the active wallet for a Supabase identity with a DIFFERENT one —
 * e.g. this identity ended up linked to more than one DeHub account (Supabase
 * links Google/Email logins that share a verified email into ONE identity, so
 * only one wallet's Supabase user_wallets row can be canonical at a time; see
 * dehubweb's AuthProvider.switchActiveWallet, which this mirrors). `secret`
 * may be a BIP-39 mnemonic or a raw hex private key (deriveFromSecret accepts
 * both) — typically the private key of the OTHER account, exported from
 * whichever device/platform is currently signed into it.
 *
 * Overwrites the Supabase user_wallets row (the cross-device source of truth
 * fetchWallet/resolveEvmWalletForIdentity reads) AND this device's local
 * fast-path cache, so both THIS device and any future login (mobile or web)
 * resolve to the new address going forward. The previous wallet's row is
 * gone once this completes — callers must have the user export/back up its
 * key first if they still want it.
 */
export async function switchActiveWalletForIdentity(
  supabaseUserId: string,
  secret: string,
  password: string,
): Promise<{ address: string; privateKey: string }> {
  const derived = deriveFromSecret(secret);

  // Many DeHub accounts (especially pre-migration Web3Auth-era ones, and any
  // AA-enabled account created via the normal write path -- see
  // wallet-core/smart-account.ts / services/auth/localProviderAdapter.ts)
  // are registered under their Safe SMART-ACCOUNT address, not the raw EOA
  // address `deriveFromSecret` returns. Using the raw EOA address here made
  // switching to (or recovering) such an account land on a brand-new,
  // unrelated account instead -- the backend simply had no record of that
  // EOA address. setupAAProvider deterministically recomputes the same Safe
  // address the account was originally created with (never throws --
  // returns null for unsupported chains/Pimlico outages, in which case we
  // fall back to the raw EOA address exactly as before).
  let canonicalAddress = derived.ethAddress;
  try {
    const chainId = (await getPreferredChainId()) ?? ChainId.BASE_MAINNET;
    const aaProvider = await setupAAProvider(derived.ethAddress, derived.ethPrivateKey, chainId);
    if (aaProvider) {
      const accounts = (await aaProvider.request({ method: "eth_accounts" })) as string[];
      if (accounts?.[0]) canonicalAddress = accounts[0];
    }
  } catch (e) {
    log.warn("switchActiveWalletForIdentity:aa-resolve-failed", e);
  }

  const encrypted = await encryptString(derived.secret, password);
  await saveWallet(supabaseUserId, canonicalAddress, encrypted);
  await upsertLocalAccount({ address: canonicalAddress, privateKey: derived.ethPrivateKey });
  await writeMapEntry(EVM_MAP_KEY, supabaseUserId, canonicalAddress.toLowerCase());
  log.info("switchActiveWalletForIdentity:switched", {
    address: `${canonicalAddress.slice(0, 6)}...${canonicalAddress.slice(-4)}`,
    isSmartAccount: canonicalAddress.toLowerCase() !== derived.ethAddress.toLowerCase(),
  });
  return { address: canonicalAddress, privateKey: derived.ethPrivateKey };
}

/**
 * Returns the local Solana keypair tied to an EVM wallet address, generating
 * one the first time. Only Supabase-identity (social/email) wallets get a
 * Solana keypair here — imported (pasted private key) wallets never had one,
 * same as before this change.
 */
export async function getOrCreateSolanaKeypairForAddress(
  evmAddress: string,
): Promise<{ address: string; secretKeyHex: string }> {
  const storeKey = SOLANA_SK_PREFIX + evmAddress.toLowerCase();
  try {
    const existing = await SecureStore.getItemAsync(storeKey);
    if (existing) {
      const kp = Keypair.fromSecretKey(hexToBytes(existing));
      return { address: kp.publicKey.toBase58(), secretKeyHex: existing };
    }
  } catch (e) {
    log.warn("getOrCreateSolanaKeypairForAddress:read:error", e);
  }

  const kp = Keypair.generate();
  const hex = bytesToHex(kp.secretKey);
  try {
    await SecureStore.setItemAsync(storeKey, hex, KEY_ACCESSIBILITY);
  } catch (e) {
    log.warn("getOrCreateSolanaKeypairForAddress:write:error", e);
  }
  return { address: kp.publicKey.toBase58(), secretKeyHex: hex };
}

/** Hex-encoded Solana secret key for an EVM address, or null if none was provisioned. */
export async function getLocalSolanaSecretKeyHex(evmAddress: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SOLANA_SK_PREFIX + evmAddress.toLowerCase());
  } catch {
    return null;
  }
}
