import { supabase } from '../services/supabase';
import { predictSafeAddress } from './wallet-core/predict-safe-address';
import { fetchWallet } from './wallet-core/store';

const ADDRESS = /^0x[0-9a-f]{40}$/i;

/** Return the session address plus the owner EOA/Safe pair for this identity. */
export async function legacyWalletAddresses(sessionAddress: string): Promise<string[]> {
  const addresses = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = value?.trim().toLowerCase();
    if (normalized && ADDRESS.test(normalized)) addresses.add(normalized);
  };

  add(sessionAddress);
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    const owner = uid ? (await fetchWallet(uid))?.ethAddress : null;
    add(owner);
    add(await predictSafeAddress(owner));
  } catch {
    // The current address remains usable when identity storage is offline.
  }
  return [...addresses];
}
