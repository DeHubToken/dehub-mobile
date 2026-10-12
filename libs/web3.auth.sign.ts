import { getSigningProvider } from "./provider.registry";
import { fetchWalletChallenge, type WalletProofPurpose } from './wallet-challenge';
import { prepareWalletRelay, waitForWalletSignature } from './wallet-relay';
import { utils } from 'ethers';

export interface StoredSignatureMeta {
  address: string;
  signature: string;
  timestamp: number; // epoch seconds
  challengeId?: string;
}

export async function getOrCreateAuthSignature(
  address: string,
  provider?: any,
  chainId: number = 8453,
  purpose: WalletProofPurpose = 'login-mobile',
): Promise<StoredSignatureMeta> {
  // Never reuse persisted signatures: each login and recovery operation has
  // its own server-issued nonce. Wallet key storage is unchanged.
  const { timestamp, message, challengeId } = await fetchWalletChallenge(address, chainId, purpose);
  const encodedMessage = utils.hexlify(utils.toUtf8Bytes(message));
  // Prefer an injected EIP-1193 provider if available
  const injected = provider || getSigningProvider();
  if (!injected || typeof injected.request !== "function") {
    throw new Error("No signing provider available");
  }

  let signature: string;
  await prepareWalletRelay(injected);
  try {
    try {
      signature = await waitForWalletSignature<string>(() => injected.request({
        method: "personal_sign",
        params: [encodedMessage, address],
      }));
    } catch (error: any) {
      // Changing parameter order only fixes an invalid-params response. A
      // cancellation or broken WalletConnect transport must not prompt twice.
      if (error?.code !== -32602 && !/invalid params|invalid parameters/i.test(error?.message ?? '')) throw error;
      signature = await waitForWalletSignature<string>(() => injected.request({
        method: "personal_sign",
        params: [address, encodedMessage],
      }));
    }
  } catch (e: any) {
    throw new Error(e?.message || "Signing message failed");
  }

  // Basic sanity: ensure a signature string was returned.
  // All real validation is done server-side via ecrecover.
  if (!signature || typeof signature !== "string" || signature.length < 10) {
    throw new Error("Invalid signature produced");
  }

  return { address, signature, timestamp, challengeId };
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
    ...(meta.challengeId ? { challengeId: meta.challengeId } : {}),
  };
}
