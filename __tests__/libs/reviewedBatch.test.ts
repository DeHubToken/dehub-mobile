import { batchSnapshot, makeReviewedBatch, reviewedBatchGraph } from '../../libs/reviewedBatch';
import { campaignReviewedBatch, filmReviewedBatch } from '../../libs/reviewedBatchDrafts';
import { EMPTY_MARKETING_BRIEF } from '../../libs/marketingBrief';

const item = (id = 'one') => ({ id, label: id, draft: { kind: 'image' as const, prompt: 'A tea tin', aspect: '1:1', owner: 'owner' }, references: [] });
describe('reviewed multi-job batches', () => {
  it('keeps each variant as a distinct paid node with immutable source provenance', () => {
    const batch = makeReviewedBatch('campaign', 'campaign', 'Launch', 'owner', [item('one'), item('two')]);
    const graph = reviewedBatchGraph(batch, 'revision', new Map());
    const paid = graph.nodes.filter(node => node.type === 'imageGenNode');
    expect(paid.map(node => node.data.batchSource)).toEqual([
      { version: 1, type: 'campaign', sourceId: 'campaign', itemId: 'one', owner: 'owner', revision: 'revision' },
      { version: 1, type: 'campaign', sourceId: 'campaign', itemId: 'two', owner: 'owner', revision: 'revision' }]);
    expect(new Set(paid.map(node => node.id)).size).toBe(2);
    expect(graph.nodes[0].data.batchSnapshot).toBe(batchSnapshot(batch));
    expect(graph.edges).toHaveLength(2);
  });
  it('persists owned reference IDs and keeps signed playback URLs out of the saved graph and identity', () => {
    const source = { sourceId: 'media', label: 'Character', url: 'https://private.test/expired' };
    const batch = makeReviewedBatch('film', 'filmproject', 'Film', 'owner', [{ ...item(), draft: { ...item().draft, references: [{ url: source.url, label: source.label }] }, references: [source] }]);
    const snapshot = batchSnapshot(batch);
    const graph = reviewedBatchGraph(batch, 'revision', new Map([['media', 'ownedasset']]));
    expect(JSON.stringify(graph)).not.toContain('private.test');
    expect(graph.nodes.find(node => node.type === 'imageInputNode')!.data.inputAssetId).toBe('ownedasset');
    batch.items[0].references[0].url = 'https://private.test/renewed';
    batch.items[0].draft.references![0].url = 'https://private.test/renewed';
    expect(batchSnapshot(batch)).toBe(snapshot);
  });
  it('rejects oversized batches, unsupported reference counts, wrong owners and unsupported video settings before quoting', () => {
    expect(() => makeReviewedBatch('film', 'project', '', 'owner', Array.from({ length: 13 }, (_, index) => item(String(index))))).toThrow('creator.batchInvalid');
    expect(() => makeReviewedBatch('film', 'project', '', 'owner', [{ ...item(), draft: { ...item().draft, owner: 'other' } }])).toThrow('creator.batchInvalid');
    expect(() => makeReviewedBatch('film', 'project', '', 'owner', [{ ...item(), draft: { ...item().draft, kind: 'video', durationSeconds: 30 } }])).toThrow('creator.batchVideoSettings');
    const refs = [{ sourceId: 'a', label: 'A', url: 'https://a.test/image' }, { sourceId: 'b', label: 'B', url: 'https://b.test/image' }];
    expect(() => makeReviewedBatch('film', 'project', '', 'owner', [{ ...item(), draft: { ...item().draft, references: refs.map(({ url, label }) => ({ url, label })) }, references: refs }])).toThrow('creator.batchReferenceLimit');
  });
  it('retains film direction and campaign language/script continuity without starting a job', () => {
    const film = { version: 1 as const, title: 'Arrival', brief: 'A quiet journey', referenceMediaIds: [], shots: [{ id: 'shot', title: 'Coast', prompt: 'The traveller arrives', seconds: 5, referenceMediaIds: [] }] };
    expect(filmReviewedBatch(film, 'video', [], '16:9', 'project', 'owner').items[0].draft.prompt).toContain('A quiet journey');
    const campaign = campaignReviewedBatch({ ...EMPTY_MARKETING_BRIEF, product: 'Tea', description: 'Whole leaves' }, { version: 1, title: 'Launch', continuity: 'Warm palette', variants: [{ id: 'variant', format: 'square', title: 'Arrival', hook: '', language: 'Spanish', headline: '', cta: '', script: 'Approved scene' }] }, 'owner');
    expect(campaign.items[0].draft.prompt).toContain('Warm palette');
    expect(campaign.items[0].draft.prompt).toContain('Spanish');
    expect(campaign.items[0].draft.prompt).toContain('Approved scene');
  });
});

