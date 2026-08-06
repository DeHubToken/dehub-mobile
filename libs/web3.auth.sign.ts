import { getSigningProvider } from "./provider.registry";
import { getAuthUser, setAuthUser } from "./auth.utils";

export interface StoredSignatureMeta {
  address: string;
  signature: string;
  timestamp: number; // epoch seconds
}

// Maximum signature age in seconds (30 days) - signatures older than this are considered invalid
// This prevents indefinitely valid signatures which could be a security risk
const SIGNATURE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function generateSignMessage(
  address: string,
  timestamp: number,
  isMobile = true
): string {
  const displayedDate = new Date(timestamp * 1000); // epoch seconds -> Date
  const validityText = isMobile ? "until you log out" : "24 hours";
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for ${validityText}.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;
}

function isSignatureValid(
  meta: StoredSignatureMeta | undefined,
  address: string,
  maxAgeSeconds: number = SIGNATURE_MAX_AGE_SECONDS
): boolean {
  if (!meta) return false;

  // Check address match
  if (meta.address.toLowerCase() !== address.toLowerCase()) {
    return false;
  }

  // Check timestamp - signature should not be older than maxAgeSeconds
  const currentTime = Math.floor(Date.now() / 1000);
  const signatureAge = currentTime - meta.timestamp;

  if (signatureAge > maxAgeSeconds) {
    return false; // Signature is too old
  }

  // Also reject signatures with future timestamps (clock skew protection)
  if (meta.timestamp > currentTime + 300) { // Allow 5 minutes of clock skew
    return false;
  }

  return true;
}

// Retrieve signature info; if missing/expired prompts new personal sign via the
// active local signing provider.
export async function getOrCreateAuthSignature(
  address: string,
  provider?: any,
  chainId: number = 8453
): Promise<StoredSignatureMeta> {
  // We can stash it inside stored user (if matches) or request a fresh one.
  let existingUser = await getAuthUser<any>();
  const existingSig: StoredSignatureMeta | undefined =
    existingUser?.authSignature;

  if (isSignatureValid(existingSig, address)) {
    return existingSig!;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const message = generateSignMessage(address, timestamp, true);
  // Prefer an injected EIP-1193 provider if available
  const injected = provider || getSigningProvider();
  if (!injected || typeof injected.request !== "function") {
    throw new Error("No signing provider available");
  }

  let signature: string;
  try {
    try {
      signature = await injected.request({
        method: "personal_sign",
        params: [message, address],
      });
    } catch {
      signature = await injected.request({
        method: "personal_sign",
        params: [address, message],
      });
    }
  } catch (e: any) {
    throw new Error(e?.message || "Signing message failed");
  }

  // Basic sanity: ensure a signature string was returned.
  // All real validation is done server-side via ecrecover.
  if (!signature || typeof signature !== "string" || signature.length < 10) {
    throw new Error("Invalid signature produced");
  }

  const meta: StoredSignatureMeta = { address, signature, timestamp };

  // Persist by merging into user object if exists
  if (existingUser) {
    existingUser = { ...existingUser, authSignature: meta };
    await setAuthUser(existingUser);
  }

  return meta;
}

export function buildAuthRequestPayload(
  address: string,
  meta: StoredSignatureMeta
) {
  return {
    address: address.toLowerCase(),
    sig: meta.signature,
    timestamp: meta.timestamp,
    isMobile: true,
  };
}
