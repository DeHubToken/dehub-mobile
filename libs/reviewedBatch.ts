import { generationDraft, type GenerationDraft } from './editor/generationDraft';
import { appendCinemaDirection } from './cinemaDirection';

export interface ReviewedBatchItem { id: string; label: string; draft: GenerationDraft; references: Array<{ sourceId: string; url: string; label: string; contentRevision?: string }> }
export interface ReviewedBatch { version: 1; type: 'film' | 'campaign'; sourceId: string; title: string; owner: string; items: ReviewedBatchItem[] }
export interface BatchNode extends Record<string, unknown> { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> & { label: string } }
export interface BatchEdge extends Record<string, unknown> { id: string; source: string; target: string; targetHandle: string }
export const BATCH_IMAGE_MODEL = 'gemini-3.1-flash-image';
export const BATCH_VIDEO_MODEL = 'seedance-2.0';

export function validateReviewedBatch(batch: ReviewedBatch): void {
  if (batch.version !== 1 || !['film', 'campaign'].includes(batch.type) || !batch.owner || batch.owner !== batch.owner.toLowerCase()
    || !/^[a-zA-Z0-9_-]{1,200}$/.test(batch.sourceId) || batch.items.length < 1 || batch.items.length > 12 || new Set(batch.items.map(item => item.id)).size !== batch.items.length) throw new Error('creator.batchInvalid');
  for (const item of batch.items) {
    const draft = generationDraft(item.draft);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || !draft || !['image', 'video'].includes(draft.kind) || !draft.prompt.trim()
      || draft.prompt.length > 6000 || draft.owner && draft.owner !== batch.owner || item.references.length !== (draft.references?.length || 0)) throw new Error('creator.batchInvalid');
    // Both Flow clients submit exactly one source image with these defaults.
    if (item.references.length > 1) throw new Error('creator.batchReferenceLimit');
    if (item.references.some((reference, index) => !/^[a-zA-Z0-9_-]{1,100}$/.test(reference.sourceId) || reference.url !== draft.references?.[index]?.url)) throw new Error('creator.batchInvalid');
    if (draft.kind === 'video' && (!['1:1', '16:9', '9:16'].includes(draft.aspect || '16:9')
      || !Number.isInteger(draft.durationSeconds ?? 5) || (draft.durationSeconds ?? 5) < 4 || (draft.durationSeconds ?? 5) > 15)) throw new Error('creator.batchVideoSettings');
  }
}

/** Immutable authored snapshot; private playback URLs are never its identity. */
export function batchSnapshot(batch: ReviewedBatch): string {
  validateReviewedBatch(batch);
  return JSON.stringify({ version: 1, type: batch.type, sourceId: batch.sourceId, title: batch.title, owner: batch.owner,
    items: batch.items.map(item => ({ id: item.id, label: item.label, kind: item.draft.kind, prompt: item.draft.prompt,
      aspect: item.draft.aspect, seconds: item.draft.durationSeconds, direction: item.draft.cinemaDirection,
      references: item.references.map(reference => ({ sourceId: reference.sourceId, label: reference.label, contentRevision: reference.contentRevision })) })) });
}

/** Every item remains a separate paid node, with its original source identity. */
export function reviewedBatchGraph(batch: ReviewedBatch, revision: string, assetIds: ReadonlyMap<string, string>) {
  validateReviewedBatch(batch);
  const nodes: BatchNode[] = [], edges: BatchEdge[] = [];
  batch.items.forEach((item, index) => {
    const promptId = `batchprompt${index}`, resultId = `batchresult${index}`, y = index * 360;
    const kind = item.draft.kind as 'image' | 'video';
    const source = { version: 1, type: batch.type, sourceId: batch.sourceId, itemId: item.id, owner: batch.owner, revision };
    nodes.push({ id: promptId, type: 'promptNode', position: { x: 0, y }, data: { label: item.label,
      prompt: appendCinemaDirection(item.draft.prompt, item.draft.cinemaDirection, kind),
      ...(index === 0 ? { batchSnapshot: batchSnapshot(batch) } : {}) } });
    nodes.push({ id: resultId, type: kind === 'image' ? 'imageGenNode' : 'videoGenNode', position: { x: 500, y },
      data: { label: item.label, status: 'idle', model: kind === 'image' ? BATCH_IMAGE_MODEL : BATCH_VIDEO_MODEL,
        aspectRatio: item.draft.aspect || (kind === 'image' ? '1:1' : '16:9'), duration: item.draft.durationSeconds ?? 5, resolution: '720p', batchSource: source } });
    edges.push({ id: `batchtext${index}`, source: promptId, target: resultId, targetHandle: 'prompt' });
    item.references.forEach((reference, referenceIndex) => {
      const assetId = assetIds.get(reference.sourceId);
      if (!assetId) throw new Error('creator.batchMissingReference');
      const id = `batchref${index}x${referenceIndex}`;
      nodes.push({ id, type: 'imageInputNode', position: { x: 0, y: y + 180 }, data: { label: reference.label, inputAssetId: assetId } });
      edges.push({ id: `batchimage${index}x${referenceIndex}`, source: id, target: resultId, targetHandle: kind === 'image' ? 'image' : 'startFrame' });
    });
  });
  return { nodes, edges };
}

/** No request, upload or billing side effects occur in draft construction. */
export function makeReviewedBatch(type: ReviewedBatch['type'], sourceId: string, title: string, owner: string, items: ReviewedBatchItem[]): ReviewedBatch {
  const batch: ReviewedBatch = { version: 1, type, sourceId, title: title.slice(0, 120), owner: owner.toLowerCase(), items };
  validateReviewedBatch(batch); return batch;
}

