import { web3AuthService } from '../services/web3auth.service';
import { getAuthUser, setAuthUser } from './auth.utils';

export interface StoredSignatureMeta {
  address: string;
  signature: string;
  timestamp: number; // epoch seconds
}

function generateSignMessage(address: string, timestamp: number, isMobile = true): string {
  const displayedDate = new Date(timestamp * 1000); // epoch seconds -> Date
  const validityText = isMobile ? 'until you log out' : '24 hours';
  return `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for ${validityText}.\nYour wallet address is ${address.toLowerCase()}.\nIt is ${displayedDate.toUTCString()}.`;
}

function isSignatureValid(meta: StoredSignatureMeta | undefined, address: string): boolean {
  if (!meta) return false;
  return meta.address.toLowerCase() === address.toLowerCase();
}

// Retrieve signature info; if missing/expired prompts new personal sign via Web3Auth
export async function getOrCreateAuthSignature(address: string): Promise<StoredSignatureMeta> {
  // We can stash it inside stored user (if matches) or request a fresh one.
  let existingUser = await getAuthUser<any>();
  const existingSig: StoredSignatureMeta | undefined = existingUser?.authSignature;

  if (isSignatureValid(existingSig, address)) {
    return existingSig!;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const message = generateSignMessage(address, timestamp, true);
  const signature = await web3AuthService.signPersonalMessage(message, address);

  const meta: StoredSignatureMeta = { address, signature, timestamp };

  // Persist by merging into user object if exists
  if (existingUser) {
    existingUser = { ...existingUser, authSignature: meta };
    await setAuthUser(existingUser);
  }

  return meta;
}

export function buildAuthRequestPayload(address: string, meta: StoredSignatureMeta) {
  return {
    address: address.toLowerCase(),
    sig: meta.signature,
    timestamp: meta.timestamp,
    isMobile: true,
  };
}
