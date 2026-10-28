import * as FileSystem from 'expo-file-system/legacy';
export interface AvatarSubmission {
  clientJobId?: string;
  txHash?: string;
  phase?: 'prepared' | 'paying' | 'signed';
  prompt?: string;
  imageDataUrl: string;
  audioDataUrl: string;
  rightsConfirmed: boolean;
  inputDigest?: string;
  acceptedPriceDhb?: number;
}
export interface AvatarQuote { priceDhb: number; priceUsd: number; inputDigest: string; durationSeconds: number }
export const avatarRequestKey = (owner: string | null | undefined, prompt: string, input: AvatarSubmission) => JSON.stringify([owner?.toLowerCase(), prompt, input.imageDataUrl, input.audioDataUrl, input.rightsConfirmed]);
export function matchingAvatarQuote(a: AvatarQuote, b: AvatarQuote) {
  return /^[a-f0-9]{64}$/.test(a.inputDigest) && a.inputDigest === b.inputDigest && a.priceDhb > 0 && a.priceDhb === b.priceDhb && a.durationSeconds === b.durationSeconds;
}
const preparedPath = (owner: string) => {
  if (!FileSystem.documentDirectory || !/^[a-zA-Z0-9:_-]{1,150}$/.test(owner)) throw new Error('Prepared input storage is unavailable');
  return `${FileSystem.documentDirectory}creator-avatar-${owner.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.json`;
};
export async function savePreparedAvatar(owner: string, input: AvatarSubmission) {
  if (!input.clientJobId || !/^[a-f0-9-]{36}$/i.test(input.clientJobId)) throw new Error('creatorFlow.recoveryPending');
  const previous = await loadPreparedAvatar(owner);
  if (previous?.clientJobId && previous.clientJobId !== input.clientJobId && previous.phase !== 'prepared') throw new Error('creatorFlow.recoveryPending');
  if (previous?.clientJobId === input.clientJobId && (previous.inputDigest !== input.inputDigest || previous.imageDataUrl !== input.imageDataUrl || previous.audioDataUrl !== input.audioDataUrl || previous.prompt !== input.prompt || previous.rightsConfirmed !== input.rightsConfirmed || previous.phase !== 'prepared' && previous.acceptedPriceDhb !== input.acceptedPriceDhb || previous.txHash && previous.txHash !== input.txHash)) throw new Error('creatorFlow.recoveryPending');
  const root = preparedPath(owner), media = `${root}.${input.clientJobId}.media`, info = await FileSystem.getInfoAsync(media);
  if (!info.exists) await FileSystem.writeAsStringAsync(media, JSON.stringify({ imageDataUrl: input.imageDataUrl, audioDataUrl: input.audioDataUrl }));
  const { imageDataUrl: _image, audioDataUrl: _audio, ...metadata } = input;
  // Phase/receipt updates never rewrite the large immutable media file.
  await FileSystem.writeAsStringAsync(`${root}.${input.clientJobId}.meta`, JSON.stringify(metadata));
  await FileSystem.writeAsStringAsync(root, input.clientJobId);
}
export async function loadPreparedAvatar(owner: string): Promise<AvatarSubmission | null> {
  const path = preparedPath(owner), info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  if (info.isDirectory || info.size > 10 * 1024 * 1024) throw new Error('creatorFlow.recoveryPending');
  const id = await FileSystem.readAsStringAsync(path);
  // Earlier releases stored the entire paid input in the owner file.
  if (id.startsWith('{')) {
    const legacy = JSON.parse(id) as AvatarSubmission;
    if (!legacy.clientJobId || !legacy.imageDataUrl || !legacy.audioDataUrl) throw new Error('creatorFlow.recoveryPending');
    return legacy;
  }
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('creatorFlow.recoveryPending');
  const mediaInfo = await FileSystem.getInfoAsync(`${path}.${id}.media`);
  if (!mediaInfo.exists || mediaInfo.isDirectory || mediaInfo.size > 10 * 1024 * 1024) throw new Error('creatorFlow.recoveryPending');
  return { ...JSON.parse(await FileSystem.readAsStringAsync(`${path}.${id}.media`)), ...JSON.parse(await FileSystem.readAsStringAsync(`${path}.${id}.meta`)) };
}
export async function clearPreparedAvatar(owner: string, id: string) {
  const current = await loadPreparedAvatar(owner);
  if (current?.clientJobId === id) await FileSystem.deleteAsync(preparedPath(owner), { idempotent: true });
}
