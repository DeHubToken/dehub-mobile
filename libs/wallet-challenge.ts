import { apiClient } from './api.client';

export async function fetchWalletChallenge(address: string, chainId: number, purpose: WalletProofPurpose): Promise<WalletChallenge> {
  const value = await apiClient.post<WalletChallenge>('/auth/wallet-challenge',
    { address: address.toLowerCase(), chainId, purpose }, { isAuthRequired: false, retrySession: true });
  return validateWalletChallenge(value, address, chainId, purpose);
}
export type WalletProofPurpose = 'login-web' | 'login-mobile' | 'rotate-wallet';
export interface WalletChallenge {
  challengeId: string;
  address: string;
  chainId: number;
  purpose: WalletProofPurpose;
  timestamp: number;
  message: string;
}

export function validateWalletChallenge(value: WalletChallenge, address: string, chainId: number, purpose: WalletProofPurpose): WalletChallenge {
  if (!value || typeof value.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(value.challengeId)
    || value.address !== address.toLowerCase() || value.chainId !== chainId || value.purpose !== purpose
    || !Number.isSafeInteger(value.timestamp) || value.timestamp <= 0 || value.timestamp > 8_640_000_000_000 - 600) {
    throw new Error('Invalid wallet verification request');
  }
  const expected = [
    'dehub.io requests wallet verification.',
    '',
    'URI: https://dehub.io',
    'Version: 2',
    'Address: ' + value.address,
    'Chain ID: ' + chainId,
    'Purpose: ' + purpose,
    'Nonce: ' + value.challengeId,
    'Issued At: ' + new Date(value.timestamp * 1000).toISOString(),
    'Expiration Time: ' + new Date((value.timestamp + 600) * 1000).toISOString(),
    '',
    'This request is single-use. It does not authorize a blockchain transaction.',
  ].join('\n');
  if (value.message !== expected) throw new Error('Invalid wallet verification message');
  return value;
}

/** A dropped first response can leave the proof consumed. Retry once with a new signature. */
export async function submitWalletProof<P, R>(
  initial: P, renew: () => Promise<P>, submit: (proof: P) => Promise<R>,
): Promise<R> {
  try { return await submit(initial); }
  catch (error) {
    if ((error as { code?: string })?.code !== 'WALLET_CHALLENGE_UNAVAILABLE') throw error;
    return submit(await renew());
  }
}

