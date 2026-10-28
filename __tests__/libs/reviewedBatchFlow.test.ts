const mockList = jest.fn(), mockSave = jest.fn(), mockUpload = jest.fn(), mockInfo = jest.fn();
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: jest.fn(async () => '1'.repeat(64)) }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: (...args: unknown[]) => mockInfo(...args) }));
jest.mock('../../services/creator.service', () => ({ saveCreatorAsset: (...args: unknown[]) => mockUpload(...args) }));
jest.mock('../../services/creator-flows.service', () => ({ flowUid: () => 'newbatch123', listFlows: (...args: unknown[]) => mockList(...args), saveFlows: (...args: unknown[]) => mockSave(...args) }));
import { prepareReviewedBatch } from '../../services/reviewed-batch-flow';
import { batchSnapshot, makeReviewedBatch } from '../../libs/reviewedBatch';
const batch = () => makeReviewedBatch('campaign', 'campaign', 'Launch', 'owner', [{ id: 'variant', label: 'Variant', draft: { kind: 'image', prompt: 'Tea', owner: 'owner' }, references: [] }]);
beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue([]); mockSave.mockResolvedValue({ ok: true }); mockInfo.mockResolvedValue({ exists: true, isDirectory: false, size: 20 }); });
it('saves a separate private Flow with every reviewed item and no generation or payment call', async () => {
  const flow = await prepareReviewedBatch(batch(), () => true);
  expect(flow.id).toBe('newbatch123'); expect(flow.isPublic).toBe(false); expect(flow.data.nodes).toHaveLength(2);
  expect(mockSave).toHaveBeenCalledWith('owner', [expect.objectContaining({ id: 'newbatch123' })]);
  expect(mockUpload).not.toHaveBeenCalled();
});
it('reopens the existing snapshot without replacing completed outputs or paid IDs', async () => {
  const saved = { id: 'existing', data: { nodes: [{ data: { batchSnapshot: batchSnapshot(batch()) } }, { data: { jobId: 'original-job', outputAssetId: 'finished' } }] } };
  mockList.mockResolvedValue([saved]);
  expect(await prepareReviewedBatch(batch(), () => true)).toBe(saved);
  expect(mockSave).not.toHaveBeenCalled(); expect(mockUpload).not.toHaveBeenCalled();
});
it('stops an owner transition before saving and copies references only to owned library IDs', async () => {
  let current = true;
  mockList.mockImplementationOnce(async () => { current = false; return []; });
  await expect(prepareReviewedBatch(batch(), () => current)).rejects.toThrow('creator.batchOwnerChanged');
  expect(mockSave).not.toHaveBeenCalled();
  const source = { sourceId: 'media', label: 'Reference', url: 'file:///private/editor.png' };
  const referenced = makeReviewedBatch('film', 'project', 'Film', 'owner', [{ id: 'shot', label: 'Shot', draft: { kind: 'image', prompt: 'Coast', owner: 'owner', references: [{ url: source.url, label: source.label }] }, references: [source] }]);
  const flow = await prepareReviewedBatch(referenced, () => true);
  expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image', url: source.url, id: expect.stringMatching(/^batchref/) }), 'owner');
  expect(JSON.stringify(flow.data)).not.toContain('file:///');
  expect(flow.data.nodes!.find(node => node.type === 'imageInputNode')!.data.inputAssetId).toMatch(/^batchref/);
});
