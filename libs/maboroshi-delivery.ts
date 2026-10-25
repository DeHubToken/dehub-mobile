import * as Crypto from 'expo-crypto';
/** Only completed hosted video outputs may cross the studio bridge. */
export interface MaboroshiDelivery {
  type: 'maboroshi:save'; requestId: string; wallet: string; projectId: string;
  url: string; version: string; createdAt: number;
}

export function isMaboroshiDelivery(value: unknown): value is MaboroshiDelivery {
  if (!value || typeof value !== 'object') return false;
  const row = value as MaboroshiDelivery;
  if (row.type !== 'maboroshi:save' || !/^[a-f0-9]{32}$/.test(row.projectId)
    || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.requestId) || !/^0x[a-f0-9]{40}$/.test(row.wallet)
    || typeof row.version !== 'string' || !/^[a-f0-9,.-]{1,2000}$/.test(row.version)
    || !Number.isFinite(row.createdAt) || row.createdAt <= 0 || typeof row.url !== 'string') return false;
  try {
    const url = new URL(row.url);
    return url.origin === 'https://live.dehub.io' && !url.username && !url.password && !url.hash
      && new RegExp(`^/maboroshi/media/${row.projectId}/(?:remake-result|final-preview|hd/final-preview)\\.mp4$`).test(url.pathname)
      && /^\d+$/.test(url.searchParams.get('expires') || '')
      && /^[a-f0-9]{64}$/.test(url.searchParams.get('signature') || '');
  } catch { return false; }
}

/** Signed URL expiry changes must not duplicate a saved take. */
export async function maboroshiAssetId(input: MaboroshiDelivery): Promise<string> {
  const key = `${input.projectId}:${new URL(input.url).pathname}:${input.version}`;
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
  return `remake-${hash.slice(0, 48)}`;
}
