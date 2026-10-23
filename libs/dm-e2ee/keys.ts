/**
 * Identity + session key management for encrypted DMs (mobile).
 *
 * The identity keypair is derived from one wallet signature and kept in the
 * device keychain (expo-secure-store) under the signed-in address, so a
 * returning session decrypts without a biometric prompt. The public half is
 * published to the API; peers fetch it to derive the shared conversation key.
 *
 * Every function here degrades to "not available" rather than throwing at a
 * call site that just wants to render a message: a peer without a published
 * key, an identity that has not been set up yet, or a message we cannot open
 * all come back as null and the caller falls back to plaintext or a
 * placeholder.
 */
import * as SecureStore from "expo-secure-store";
import { Buffer } from "buffer";
import { apiClient } from "../api.client";
import { prepareWalletRelay, waitForWalletSignature } from "../wallet-relay";
import { getEoaSigningProvider, getSigningProvider, OPEN_WALLET_METHOD } from "../provider.registry";
import { WalletLockedError } from "../wallet-lock";
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
  type IdentityKeyPair,
} from "./crypto";
import { decodeMediaDescriptor, isMediaDescriptor, type MediaDescriptor } from "./media";

/**
 * No wallet has been offered to sign with yet — the session is still coming
 * up, or this account signs somewhere this app cannot reach. Deliberately not
 * a `WalletLockedError`: nobody has refused anything, so it must not be
 * remembered as a refusal.
 */
export class NoSigningProviderError extends Error {
  constructor() {
    super("No signing provider available for encrypted messages");
    this.name = "NoSigningProviderError";
  }
}

const STORE_PREFIX = "dehub_dm_e2ee_";
const PEER_KEY_TTL_MS = 5 * 60_000;
const PEER_KEY_MISS_TTL_MS = 30_000;

/** v2 uses the EOA signature. Older identities are retained for history
 * when the current signer is set up; they are never published as the new key. */
interface StoredIdentity {
  v: 2;
  priv: string;
  pub: string;
  previous?: Array<{ priv: string; pub: string }>;
}

const STORED_IDENTITY_VERSION = 2;

let current: { address: string; keys: IdentityKeyPair } | null = null;
let setupInFlight: Promise<{ publicKey: string }> | null = null;
// Keep prior session keys for history; the current peer key is still refreshed.
const sessionKeys = new Map<string, Uint8Array>();
let previousIdentities: IdentityKeyPair[] = [];
const historicalPublicKeys = new Map<string, Set<string>>();
let historyWrite: Promise<void> = Promise.resolve();
const refreshAttempts = new Map<string, number>();
const refreshes = new Map<string, Promise<Uint8Array | null>>();
const peerFetches = new Map<string, Promise<string | null>>();
const peerKeys = new Map<string, { key: string | null; at: number }>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch { /* listener errors must not break the caller */ }
  });
}

/** Subscribe to identity changes (set up / cleared). Returns unsubscribe. */
export function onIdentityChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function norm(address: string): string {
  return (address || "").toLowerCase();
}

// SecureStore keys may only contain [A-Za-z0-9._-]; a 0x address qualifies.
function storeKey(address: string): string {
  return STORE_PREFIX + norm(address).replace(/[^a-z0-9]/g, "");
}

async function readStored(address: string): Promise<StoredIdentity | null> {
  try {
    const raw = await SecureStore.getItemAsync(storeKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (parsed?.v !== STORED_IDENTITY_VERSION || !parsed.priv || !parsed.pub) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStored(address: string, keys: IdentityKeyPair): Promise<void> {
  // Read failures or invalid records must never turn into an overwrite.
  const raw = await SecureStore.getItemAsync(storeKey(address));
  const old = raw ? JSON.parse(raw) as StoredIdentity : null;
  if (old && (!isValidPublicKey(old.pub) || fromBase64(old.priv).length !== 32)) {
    throw new Error('Existing message identity could not be preserved');
  }
  const pub = toBase64(keys.publicKey);
  const previous = [...(old?.previous ?? [])];
  if (old && old.pub !== pub && !previous.some(item => item.pub === old.pub)) {
    previous.push({ priv: old.priv, pub: old.pub });
  }
  const rec: StoredIdentity = { v: STORED_IDENTITY_VERSION, priv: toBase64(keys.privateKey), pub, previous };
  await SecureStore.setItemAsync(storeKey(address), JSON.stringify(rec), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  previousIdentities = previous.map(item => ({ privateKey: fromBase64(item.priv), publicKey: fromBase64(item.pub) }));
}

/** The identity currently loaded in memory, if any. */
export function getIdentity(): { address: string; publicKey: string } | null {
  return current ? { address: current.address, publicKey: toBase64(current.keys.publicKey) } : null;
}

export function hasIdentityFor(address: string): boolean {
  return !!current && current.address === norm(address);
}

/** Load a previously derived identity for this address from the keychain. */
export async function loadIdentity(address: string): Promise<boolean> {
  const addr = norm(address);
  if (!addr) return false;
  if (current?.address === addr) return true;
  const stored = await readStored(addr);
  if (!stored) return false;
  try {
    current = { address: addr, keys: { privateKey: fromBase64(stored.priv), publicKey: fromBase64(stored.pub) } };
    previousIdentities = (stored.previous ?? []).map(item => ({ privateKey: fromBase64(item.priv), publicKey: fromBase64(item.pub) }));
    sessionKeys.clear();
    notify();
    return true;
  } catch {
    return false;
  }
}

/** Forget the in-memory identity (sign-out). The stored copy stays for the next sign-in. */
export function unloadIdentity(): void {
  current = null;
  previousIdentities = [];
  historicalPublicKeys.clear();
  refreshAttempts.clear();
  refreshes.clear();
  peerFetches.clear();
  sessionKeys.clear();
  peerKeys.clear();
  notify();
}

/**
 * Find the provider that must produce the identity signature.
 *
 * It has to be the plain EOA's. Most accounts sign in as a Safe smart account,
 * and a Safe signs a message through ERC-1271 — a different value from its
 * owner's EIP-191 signature over the same text. dehubweb derives its identity
 * from the EOA signature, so a phone signing with the AA provider would derive
 * a keypair web can never match, and the two devices would take turns
 * overwriting each other's published key.
 *
 * `live` is the session's provider (AuthContext). On a returning session the
 * registry is empty — it is only written during an interactive sign-in — and
 * `live` is the locked shim, so one `dehub_openWallet` raises the unlock and
 * registers the EOA signer for this and every later call.
 */
async function eoaSigner(live?: any): Promise<any> {
  const registered = getEoaSigningProvider();
  if (typeof registered?.request === "function") return registered;

  const opener = live || getSigningProvider();
  // Distinct from a refusal: nothing has been asked yet. The caller retries
  // this, where it remembers a refusal for the session.
  if (typeof opener?.request !== "function") throw new NoSigningProviderError();

  try {
    await opener.request({ method: OPEN_WALLET_METHOD });
  } catch (e) {
    // Only the locked shim knows this method. An external wallet rejects it as
    // an unknown RPC call, which is not a failure here — it holds its own EOA
    // and signs with it directly. A refused unlock is a failure, and says so.
    if ((e as any)?.name === "WalletLockedError") throw e;
  }
  const opened = getEoaSigningProvider();
  // An external wallet registers nothing above; it signs as its own EOA anyway.
  return typeof opened?.request === "function" ? opened : opener;
}

async function personalSign(message: string, address: string, live?: any): Promise<string> {
  const provider = await eoaSigner(live);
  let signer = address;
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    if (accounts?.[0]) signer = accounts[0];
  } catch { /* fall back to the identity address */ }
  const encoded = `0x${Buffer.from(message, 'utf8').toString('hex')}`;
  await prepareWalletRelay(provider);
  // Retry argument order only for invalid parameters, never a refused signature.
  try {
    return await waitForWalletSignature<string>(() => provider.request({ method: "personal_sign", params: [encoded, signer] }));
  } catch (e) {
    const error = e as { code?: number; message?: string };
    if (error?.code !== -32602 && !/invalid params|invalid parameters/i.test(error?.message ?? '')) throw e;
    return await waitForWalletSignature<string>(() => provider.request({ method: "personal_sign", params: [signer, encoded] }));
  }
}

/**
 * Derive the identity from a wallet signature, persist it, and publish the
 * public key. On a locked wallet the provider shim raises the unlock sheet
 * itself; a rejection propagates as WalletLockedError for the caller to retry.
 */
export function setupIdentity(address: string, provider?: any): Promise<{ publicKey: string }> {
  if (setupInFlight) return setupInFlight;
  const addr = norm(address);
  setupInFlight = (async () => {
    const signature = await personalSign(encryptionSignMessage(addr), addr, provider);
    const keys = deriveIdentityFromSignature(signature);
    await writeStored(addr, keys);
    current = { address: addr, keys };
    sessionKeys.clear();
    const publicKey = toBase64(keys.publicKey);
    await publishPublicKey(publicKey);
    peerKeys.set(addr, { key: publicKey, at: Date.now() });
    notify();
    return { publicKey };
  })();
  const pending = setupInFlight;
  pending.then(
    () => { if (setupInFlight === pending) setupInFlight = null; },
    () => { if (setupInFlight === pending) setupInFlight = null; },
  );
  return pending;
}

/** Push our public key to the API so peers can encrypt to us. */
export async function publishPublicKey(publicKey: string): Promise<void> {
  await apiClient.post("/dm/e2ee-key", { publicKey }, { isAuthRequired: true });
}

/**
 * Make sure the key the server holds for us is the one we have locally. A
 * mismatch means another signer (or an older build) published a different
 * key; ours wins because it is the one this device can decrypt with.
 */
export async function syncPublishedKey(): Promise<void> {
  if (!current) return;
  const mine = toBase64(current.keys.publicKey);
  const remote = await fetchPeerPublicKey(current.address, { force: true });
  if (remote !== mine) await publishPublicKey(mine);
  peerKeys.set(current.address, { key: mine, at: Date.now() });
}

/** Fetch (and cache) a user's published public key. Null when they have none. */
export async function fetchPeerPublicKey(
  address: string,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  const addr = norm(address);
  if (!addr) return null;
  const cached = peerKeys.get(addr);
  const ttl = cached?.key ? PEER_KEY_TTL_MS : PEER_KEY_MISS_TTL_MS;
  if (!opts.force && cached && Date.now() - cached.at < ttl) return cached.key;
  try {
    const res = await apiClient.get<{ address?: string; publicKey?: string | null }>(`/dm/e2ee-key/${addr}`, {
      isAuthRequired: true,
    });
    // The response names the address it answered for, and it has to be the one
    // we asked about. A key for anyone else is not a key we can use: encrypting
    // to it produces a message only its holder can open, and the recipient sees
    // an envelope they cannot touch. The server did exactly that for three days
    // (its auth guard overwrote the address in the path with the caller's own),
    // and no client could tell, because a wrong key is still a valid key.
    const answered = String(res?.address || "").toLowerCase();
    const key = answered === addr && isValidPublicKey(res?.publicKey) ? res.publicKey : null;
    peerKeys.set(addr, { key, at: Date.now() });
    return key;
  } catch {
    // Keep whatever we had rather than flapping between encrypted and plain.
    return cached?.key ?? null;
  }
}

/** Persist public keys already seen by this account so reloads retain history. */
async function rememberPeerKey(address: string, peer: string, publicKey: string | null): Promise<void> {
  const operation = historyWrite.then(async () => {
    const storageKey = `dehub_dm_peers_${address}_${peer}`;
    const existing = current?.address === address ? historicalPublicKeys.get(peer) : undefined;
    if (existing && (!publicKey || existing.has(publicKey))) return;
    const raw = await SecureStore.getItemAsync(storageKey);
    const stored: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(stored) || !stored.every(isValidPublicKey)) return;
    if (current?.address !== address) return;
    const keys = historicalPublicKeys.get(peer) ?? new Set<string>();
    stored.forEach(value => keys.add(value));
    const changed = !!publicKey && !stored.includes(publicKey);
    if (publicKey) keys.add(publicKey);
    historicalPublicKeys.set(peer, keys);
    if (changed) { await SecureStore.setItemAsync(storageKey, JSON.stringify([...keys])); }
  });
  // Storage failure cannot delete old records or prevent reading with a key
  // already in memory. Identity replacement, separately, fails closed.
  historyWrite = operation.catch(() => {});
  await historyWrite;
}

function sessionId(peer: string, publicKey: string): string {
  return `${peer}:${publicKey}`;
}

async function getSessionKey(peerAddress: string, force = false): Promise<Uint8Array | null> {
  const identity = current;
  if (!identity) return null;
  const peer = norm(peerAddress);
  if (!peer) return null;
  // Resolve the peer before consulting the derived cache so its TTL is honored.
  const fetchId = `${identity.address}:${peer}:${force}`;
  let pending = peerFetches.get(fetchId);
  if (!pending) {
    pending = fetchPeerPublicKey(peer, { force });
    peerFetches.set(fetchId, pending);
  }
  let pub: string | null;
  try { pub = await pending; }
  finally { if (peerFetches.get(fetchId) === pending) peerFetches.delete(fetchId); }
  if (current !== identity) return null;
  await rememberPeerKey(identity.address, peer, pub);
  if (!pub || current !== identity) return null;
  const id = sessionId(peer, pub);
  const hit = sessionKeys.get(id);
  if (hit) return hit;
  const key = deriveSessionKey(identity.keys.privateKey, fromBase64(pub), identity.address, peer);
  sessionKeys.set(id, key);
  return key;
}

/** Try retained identities and session keys without changing any message. */
function openHistory(peerAddress: string, envelope: string): string | null {
  if (!current) return null;
  const peer = norm(peerAddress);
  const publicKeys = new Set(historicalPublicKeys.get(peer));
  const latest = peerKeys.get(peer)?.key;
  if (latest) publicKeys.add(latest);
  for (const [id, key] of sessionKeys) {
    if (!id.startsWith(`${peer}:`)) continue;
    publicKeys.add(id.slice(peer.length + 1));
    try { return decryptText(envelope, key); } catch { /* try another retained key */ }
  }
  for (const identity of [current.keys, ...previousIdentities]) {
    for (const pub of [...publicKeys, toBase64(identity.publicKey)]) {
      try {
        return decryptText(envelope, deriveSessionKey(identity.privateKey, fromBase64(pub), current.address, peer));
      } catch { /* wrong historical key or unauthenticated envelope */ }
    }
  }
  return null;
}



/** True once a session key for this peer is derived (sync decrypt possible). */
export function canEncryptTo(peerAddress: string): boolean {
  return !!current && !!peerKeys.get(norm(peerAddress))?.key && sessionKeys.has(sessionId(norm(peerAddress), peerKeys.get(norm(peerAddress))!.key!));
}

/** Warm the session key for a peer so later sync decrypts succeed. */
export async function prepareSession(peerAddress: string): Promise<boolean> {
  return !!(await getSessionKey(peerAddress));
}

/**
 * Encrypt outgoing text for a peer. Returns null when encryption is not
 * possible (no identity yet, peer has no key) so the caller can send plain.
 */
export async function encryptForPeer(peerAddress: string, plaintext: string): Promise<string | null> {
  if (!plaintext) return null;
  const key = await getSessionKey(peerAddress);
  if (!key) return null;
  try {
    return encryptText(plaintext, key);
  } catch {
    return null;
  }
}

/**
 * What goes on the wire for an outgoing text: the ciphertext when both sides
 * have keys, otherwise the plaintext unchanged (peer on an older build, peer
 * without keys, the assistant bot, or our own identity not set up yet).
 */
export async function prepareOutgoing(
  peerAddress: string | null | undefined,
  plaintext: string,
): Promise<{ content: string; encrypted: boolean }> {
  if (!plaintext || !peerAddress) return { content: plaintext, encrypted: false };
  const ct = await encryptForPeer(peerAddress, plaintext);
  return ct ? { content: ct, encrypted: true } : { content: plaintext, encrypted: false };
}

/** Decrypt an envelope from/for a peer. Null when it cannot be opened. */
export async function decryptFromPeer(peerAddress: string, envelope: string): Promise<string | null> {
  if (!isEncryptedContent(envelope)) return envelope;
  const identity = current;
  if (!identity) return null;
  const key = await getSessionKey(peerAddress);
  if (current !== identity) return null;
  if (key) {
    try { return decryptText(envelope, key); } catch { /* refresh a stale peer key */ }
  }
  const historical = openHistory(peerAddress, envelope);
  if (historical !== null) return historical;
  const peer = norm(peerAddress);
  const last = refreshAttempts.get(peer);
  let refresh = refreshes.get(peer);
  // One refresh per peer per 30 seconds, shared by a whole history batch.
  if (!refresh && (last === undefined || Date.now() - last >= PEER_KEY_MISS_TTL_MS)) {
    refreshAttempts.set(peer, Date.now());
    refresh = getSessionKey(peer, true);
    refreshes.set(peer, refresh);
  }
  if (refresh) {
    try { await refresh; }
    finally { if (refreshes.get(peer) === refresh) refreshes.delete(peer); }
  }
  return current === identity ? openHistory(peer, envelope) : null;
}

/** Sync variant for hot paths; only works once the session key is cached. */
export function decryptFromPeerSync(peerAddress: string, envelope: string): string | null {
  if (!isEncryptedContent(envelope)) return envelope;
  return openHistory(peerAddress, envelope);
}

/**
 * Shape shared by every message-like record we decrypt in place. `encrypted`
 * is set on the result so the UI can show a lock; `content` becomes the
 * plaintext, or '' with `undecryptable` when the envelope cannot be opened
 * (so nothing downstream ever renders raw ciphertext).
 */
export interface DecryptableMessage {
  content?: string;
  encrypted?: boolean;
  undecryptable?: boolean;
  encMedia?: MediaDescriptor | null;
  replyTo?: { content?: string; encMedia?: MediaDescriptor | null } | null;
}

/**
 * Split an opened plaintext into what the UI shows: an encrypted
 * attachment's descriptor (holding its key) never reaches `content` — only its
 * caption does. A malformed descriptor comes back as unreadable rather than
 * as raw JSON.
 */
export function splitOpenedContent(plain: string): { content: string; encMedia?: MediaDescriptor; broken?: boolean } {
  if (!isMediaDescriptor(plain)) return { content: plain };
  const media = decodeMediaDescriptor(plain);
  return media ? { content: media.caption || "", encMedia: media } : { content: "", broken: true };
}

export async function decryptMessageInPlace<T extends DecryptableMessage>(
  msg: T,
  peerAddress: string | null | undefined,
): Promise<T> {
  let out = msg;
  if (isEncryptedContent(msg.content)) {
    const plain = peerAddress ? await decryptFromPeer(peerAddress, msg.content as string) : null;
    const opened = plain !== null ? splitOpenedContent(plain) : null;
    out = opened && !opened.broken
      ? {
          ...out,
          content: opened.content,
          encrypted: true,
          undecryptable: false,
          ...(opened.encMedia ? { encMedia: opened.encMedia } : {}),
        }
      : { ...out, content: "", encrypted: true, undecryptable: true };
  }
  if (msg.replyTo && isEncryptedContent(msg.replyTo.content)) {
    const plain = peerAddress ? await decryptFromPeer(peerAddress, msg.replyTo.content as string) : null;
    const opened = plain !== null ? splitOpenedContent(plain) : null;
    out = {
      ...out,
      replyTo: {
        ...msg.replyTo,
        content: opened?.content ?? "",
        ...(opened?.encMedia ? { encMedia: opened.encMedia } : {}),
      },
    };
  }
  return out;
}
