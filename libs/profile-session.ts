import { predictSafeAddress } from './wallet-core/predict-safe-address';

/** Verify public account identity without accessing a signer or unlocking keys. */
export async function profileSessionMatchesWallet(address: string, owner?: string, linkSource?: string | null): Promise<boolean> {
  if (!owner || linkSource === 'wallet-email') return true;
  return address.toLowerCase() === owner.toLowerCase() || address.toLowerCase() === await predictSafeAddress(owner);
}
