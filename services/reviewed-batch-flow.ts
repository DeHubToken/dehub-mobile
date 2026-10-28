import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { batchSnapshot, reviewedBatchGraph, type ReviewedBatch } from '../libs/reviewedBatch';
import { flowUid, listFlows, saveFlows, type RemoteFlow } from './creator-flows.service';
import { saveCreatorAsset } from './creator.service';
import { loadFlowAssets } from './creator-flow-assets';

const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
/** A separate private Flow is the immutable reviewed batch and recovery target. */
export async function prepareReviewedBatch(batch: ReviewedBatch, isCurrent: () => boolean): Promise<RemoteFlow> {
  batch = JSON.parse(JSON.stringify(batch)) as ReviewedBatch;
  const check = () => { if (!isCurrent()) throw new Error('creator.batchOwnerChanged'); };
  check();
  batchSnapshot(batch);
  const revisions = new Map<string, string>();
  for (const reference of batch.items.flatMap(item => item.references)) {
    if (!revisions.has(reference.sourceId)) {
      if (!reference.url.startsWith('file://')) throw new Error('creator.batchMissingReference');
      const info = await FileSystem.getInfoAsync(reference.url); check();
      if (!info.exists || info.isDirectory || !info.size || info.size > 25 * 1024 * 1024) throw new Error('creator.batchMissingReference');
      revisions.set(reference.sourceId, await digest(await FileSystem.readAsStringAsync(reference.url, { encoding: FileSystem.EncodingType.Base64 }))); check();
    }
    reference.contentRevision = revisions.get(reference.sourceId);
  }
  const snapshot = batchSnapshot(batch), revision = await digest(snapshot), id = flowUid();
  check();
  const saved = await listFlows(batch.owner);
  const existing = saved.find(flow => flow.data.nodes?.[0]?.data.batchSnapshot === snapshot);
  check();
  if (existing) {
    if (existing.data.nodes?.[0]?.data.batchSnapshot !== snapshot) throw new Error('creator.batchConflict');
    return existing;
  }
  if (saved.length >= 100) throw new Error('creator.batchFlowLimit');
  const assets = new Map<string, string>();
  const referenceIds = new Map<string, string>();
  for (const reference of batch.items.flatMap(item => item.references)) referenceIds.set(reference.sourceId, `batchref${(await digest(`${batch.owner}:${reference.sourceId}:${reference.contentRevision}`)).slice(0, 32)}`);
  check();
  const owned = await loadFlowAssets(batch.owner, [...referenceIds.values()]); check();
  for (const reference of batch.items.flatMap(item => item.references)) {
    if (assets.has(reference.sourceId)) continue;
    const assetId = referenceIds.get(reference.sourceId)!;
    if (owned.get(assetId)?.kind === 'image' && owned.get(assetId)?.url) { assets.set(reference.sourceId, assetId); continue; }
    check();
    const extension = /\.(png|jpe?g|webp)$/i.exec(reference.url)?.[1]?.toLowerCase();
    if (!extension || !FileSystem.cacheDirectory) throw new Error('creator.batchMissingReference');
    const copy = `${FileSystem.cacheDirectory}batchref-${Crypto.randomUUID()}.${extension}`;
    try {
      await FileSystem.copyAsync({ from: reference.url, to: copy }); check();
      const info = await FileSystem.getInfoAsync(copy);
      if (!info.exists || !info.size || info.size > 25 * 1024 * 1024 || await digest(await FileSystem.readAsStringAsync(copy, { encoding: FileSystem.EncodingType.Base64 })) !== reference.contentRevision) throw new Error('creator.batchMissingReference');
      check();
      await saveCreatorAsset({ id: assetId, kind: 'image', model: 'import', modelName: reference.label, prompt: reference.label, createdAt: Date.now(), url: copy }, batch.owner);
    } finally { await FileSystem.deleteAsync(copy, { idempotent: true }).catch(() => {}); }
    check(); assets.set(reference.sourceId, assetId);
  }
  const graph = reviewedBatchGraph(batch, revision, assets), now = Date.now();
  const flow = { id, name: batch.title || `${batch.type} batch`, isPublic: false, data: { ...graph, nodeCounters: {}, createdAt: now, updatedAt: now } };
  check(); await saveFlows(batch.owner, [flow]); check();
  return { ...flow, coverUrl: null, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
}
