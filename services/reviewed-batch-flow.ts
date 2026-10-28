import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { batchSnapshot, reviewedBatchGraph, type ReviewedBatch } from '../libs/reviewedBatch';
import { flowUid, listFlows, saveFlows, type RemoteFlow } from './creator-flows.service';
import { saveCreatorAsset } from './creator.service';

const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
/** A separate private Flow is the immutable reviewed batch and recovery target. */
export async function prepareReviewedBatch(batch: ReviewedBatch, isCurrent: () => boolean): Promise<RemoteFlow> {
  batch = JSON.parse(JSON.stringify(batch)) as ReviewedBatch;
  const check = () => { if (!isCurrent()) throw new Error('creator.batchOwnerChanged'); };
  check();
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
  for (const reference of batch.items.flatMap(item => item.references)) {
    if (assets.has(reference.sourceId)) continue;
    const assetId = `batchref${(await digest(`${batch.owner}:${batch.type}:${batch.sourceId}:${reference.sourceId}`)).slice(0, 32)}`;
    check();
    // Editor references are existing private local files. Remote imports must
    // first pass through the editor's normal download/import validation.
    if (!reference.url.startsWith('file://')) throw new Error('creator.batchMissingReference');
    const info = await FileSystem.getInfoAsync(reference.url);
    if (!info.exists || info.isDirectory || !info.size || info.size > 25 * 1024 * 1024) throw new Error('creator.batchMissingReference');
    check();
    await saveCreatorAsset({ id: assetId, kind: 'image', model: 'import', modelName: reference.label, prompt: reference.label, createdAt: Date.now(), url: reference.url }, batch.owner);
    check(); assets.set(reference.sourceId, assetId);
  }
  const graph = reviewedBatchGraph(batch, revision, assets), now = Date.now();
  const flow = { id, name: batch.title || `${batch.type} batch`, isPublic: false, data: { ...graph, nodeCounters: {}, createdAt: now, updatedAt: now } };
  check(); await saveFlows(batch.owner, [flow]); check();
  return { ...flow, coverUrl: null, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
}
