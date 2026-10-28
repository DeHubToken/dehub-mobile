import * as FileSystem from 'expo-file-system/legacy';
export interface AvatarSubmission {
  clientJobId?: string;
  txHash?: string;
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
  await FileSystem.writeAsStringAsync(preparedPath(owner), JSON.stringify(input));
}
export async function loadPreparedAvatar(owner: string): Promise<AvatarSubmission | null> {
  const path = preparedPath(owner), info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory || info.size > 10 * 1024 * 1024) return null;
  return JSON.parse(await FileSystem.readAsStringAsync(path));
}
