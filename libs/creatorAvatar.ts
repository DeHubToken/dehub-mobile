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

async function replaceStoredFile(path: string, value: string) {
  const next = `${path}.next`, previous = `${path}.previous`;
  await FileSystem.writeAsStringAsync(next, value);
  const current = await FileSystem.getInfoAsync(path);
  if (current.exists) {
    // iOS legacy move removes its destination before renaming. Preserve the
    // last complete record across that gap as well as interrupted temp writes.
    let valid = false;
    try { const raw = await FileSystem.readAsStringAsync(path); valid = /^[a-f0-9-]{36}$/i.test(raw) || !!JSON.parse(raw); } catch { /* retain the existing backup */ }
    if (valid) {
      await FileSystem.copyAsync({ from: path, to: `${previous}.next` });
      await FileSystem.moveAsync({ from: `${previous}.next`, to: previous });
    }
  }
  await FileSystem.moveAsync({ from: next, to: path });
}

async function readStoredFile<T>(path: string, parse: (raw: string) => T): Promise<T | null> {
  let found = false;
  for (const candidate of [path, `${path}.previous`]) {
    const info = await FileSystem.getInfoAsync(candidate);
    if (!info.exists) continue;
    found = true;
    try {
      if (info.isDirectory || info.size > 10 * 1024 * 1024) throw new Error('invalid');
      return parse(await FileSystem.readAsStringAsync(candidate));
    } catch { /* recover the last complete record */ }
  }
  if (found) throw new Error('creatorFlow.recoveryPending');
  return null;
}
export async function savePreparedAvatar(owner: string, input: AvatarSubmission) {
  if (!input.clientJobId || !/^[a-f0-9-]{36}$/i.test(input.clientJobId)) throw new Error('creatorFlow.recoveryPending');
  const previous = await loadPreparedAvatar(owner);
  if (previous?.clientJobId && previous.clientJobId !== input.clientJobId && previous.phase !== 'prepared') throw new Error('creatorFlow.recoveryPending');
  if (previous?.clientJobId === input.clientJobId && (previous.inputDigest !== input.inputDigest || previous.imageDataUrl !== input.imageDataUrl || previous.audioDataUrl !== input.audioDataUrl || previous.prompt !== input.prompt || previous.rightsConfirmed !== input.rightsConfirmed || previous.phase !== 'prepared' && previous.acceptedPriceDhb !== input.acceptedPriceDhb || previous.txHash && previous.txHash !== input.txHash)) throw new Error('creatorFlow.recoveryPending');
  const root = preparedPath(owner), media = `${root}.${input.clientJobId}.media`, info = await FileSystem.getInfoAsync(media);
  if (!info.exists) await replaceStoredFile(media, JSON.stringify({ imageDataUrl: input.imageDataUrl, audioDataUrl: input.audioDataUrl }));
  const { imageDataUrl: _image, audioDataUrl: _audio, ...metadata } = input;
  // Phase/receipt updates never rewrite the large immutable media file.
  await replaceStoredFile(`${root}.${input.clientJobId}.meta`, JSON.stringify(metadata));
  // A phase update does not need to touch the active job pointer.
  const active = await FileSystem.getInfoAsync(root);
  if (!active.exists || await FileSystem.readAsStringAsync(root) !== input.clientJobId) await replaceStoredFile(root, input.clientJobId);
}
export async function loadPreparedAvatar(owner: string): Promise<AvatarSubmission | null> {
  const path = preparedPath(owner);
  const record = await readStoredFile(path, raw => {
    if (/^[a-f0-9-]{36}$/i.test(raw)) return raw;
    const legacy = JSON.parse(raw) as AvatarSubmission;
    if (!legacy.clientJobId || !legacy.imageDataUrl || !legacy.audioDataUrl) throw new Error('invalid');
    return legacy;
  });
  if (record === null || typeof record !== 'string') return record;
  const id = record;
  const mediaInfo = await FileSystem.getInfoAsync(`${path}.${id}.media`);
  if (!mediaInfo.exists || mediaInfo.isDirectory || mediaInfo.size > 10 * 1024 * 1024) throw new Error('creatorFlow.recoveryPending');
  const metadata = await readStoredFile(`${path}.${id}.meta`, raw => {
    const parsed = JSON.parse(raw) as AvatarSubmission;
    if (parsed.clientJobId !== id) throw new Error('invalid');
    return parsed;
  });
  if (!metadata) throw new Error('creatorFlow.recoveryPending');
  return { ...JSON.parse(await FileSystem.readAsStringAsync(`${path}.${id}.media`)), ...metadata };
}
export async function clearPreparedAvatar(owner: string, id: string) {
  const current = await loadPreparedAvatar(owner);
  if (current?.clientJobId === id) {
    const root = preparedPath(owner);
    // Remove the fallback first: a crash cannot resurrect an older draft.
    await FileSystem.deleteAsync(`${root}.previous`, { idempotent: true });
    await FileSystem.deleteAsync(root, { idempotent: true });
  }
}
