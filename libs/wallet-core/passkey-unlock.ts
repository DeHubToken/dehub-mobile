import { Passkey } from 'react-native-passkey';
import { Buffer } from 'buffer';
import * as ExpoCrypto from 'expo-crypto';
import { supabase } from '../../services/supabase';
import { decryptStringWithKeyMaterial } from './crypto';
import { translateCopy as _translateCopy } from '../../i18n/copy';

/** Open the same passkey-encrypted backup used by dehub.io, on this phone. */
export async function unlockWithSavedPasskey(userId: string): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  if (session.session?.user.id !== userId) throw new Error(_translateCopy('copy.74af85e9fd7f', { defaultValue: 'Sign in again to recover this wallet.' }));
  const { data, error } = await supabase.from('user_wallet_passkeys')
    .select('credential_id, prf_salt, encrypted_seed, salt, iv, kdf_iterations')
    .eq('user_id', userId);
  if (error) throw new Error(_translateCopy('copy.a7df07227832', { defaultValue: 'Could not load your saved passkey. Try again.' }));
  const wraps = (data ?? []).filter(w => w.credential_id && w.prf_salt && w.encrypted_seed);
  if (!wraps.length) throw new Error(_translateCopy('copy.810cfe689ae4', { defaultValue: 'No saved passkey backup was found for this wallet.' }));
  if (!Passkey.isSupported()) throw new Error(_translateCopy('copy.c73083d55dae', { defaultValue: 'Use dehub.io on a device with your saved passkey to recover this wallet.' }));
  const response = await Passkey.get({
    rpId: 'dehub.io',
    challenge: Buffer.from(ExpoCrypto.getRandomBytes(32)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    userVerification: 'required',
    timeout: 60000,
    allowCredentials: wraps.map(w => ({ type: 'public-key', id: w.credential_id })),
    extensions: { prf: wraps.length === 1
      ? { eval: { first: Uint8Array.from(Buffer.from(wraps[0].prf_salt, 'base64')) } }
      : { evalByCredential: Object.fromEntries(wraps.map(w => [w.credential_id,
        { first: Uint8Array.from(Buffer.from(w.prf_salt, 'base64')) }])) } },
  });
  const normalizeId = (id: string) => id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const wrap = wraps.find(w => normalizeId(w.credential_id) === normalizeId(response.rawId || response.id));
  const first = response.clientExtensionResults?.prf?.results?.first;
  if (!wrap || !first) throw new Error(_translateCopy('copy.c948babeda76', { defaultValue: 'This passkey could not unlock your wallet. Try the device where you saved it.' }));
  const material = typeof first === 'string'
    ? Uint8Array.from(Buffer.from(first, 'base64'))
    : first instanceof ArrayBuffer ? new Uint8Array(first) : Uint8Array.from(first);
  try {
    if (material.length !== 32) throw new Error(_translateCopy('copy.04b0d21874d5', { defaultValue: 'The passkey returned an invalid wallet key.' }));
    return await decryptStringWithKeyMaterial({
      ciphertext: wrap.encrypted_seed, salt: wrap.salt, iv: wrap.iv,
      iterations: wrap.kdf_iterations ?? 0,
    }, material);
  } finally {
    material.fill(0);
  }
}
