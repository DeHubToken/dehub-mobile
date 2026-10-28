const mockList = jest.fn(), mockSave = jest.fn(), mockUpload = jest.fn(), mockInfo = jest.fn(), mockOwned = jest.fn(), mockRead = jest.fn(), mockCopy = jest.fn();
let mockNextId = 0;
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, randomUUID: () => 'temporary-copy', digestStringAsync: jest.fn(async (_algorithm: string, value: string) => jest.requireActual('node:crypto').createHash('sha256').update(value).digest('hex')) }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' }, getInfoAsync: (...args: unknown[]) => mockInfo(...args), readAsStringAsync: (...args: unknown[]) => mockRead(...args), copyAsync: (...args: unknown[]) => mockCopy(...args), deleteAsync: jest.fn(async () => {}) }));
jest.mock('../../services/creator-flow-assets', () => ({ loadFlowAssets: (...args: unknown[]) => mockOwned(...args) }));
jest.mock('../../services/creator.service', () => ({ saveCreatorAsset: (...args: unknown[]) => mockUpload(...args) }));
jest.mock('../../services/creator-flows.service', () => ({ flowUid: () => `newbatch${mockNextId++}`, listFlows: (...args: unknown[]) => mockList(...args), saveFlows: (...args: unknown[]) => mockSave(...args) }));
import { prepareReviewedBatch } from '../../services/reviewed-batch-flow';
import { batchSnapshot, makeReviewedBatch } from '../../libs/reviewedBatch';
const batch = () => makeReviewedBatch('campaign', 'campaign', 'Launch', 'owner', [{ id: 'variant', label: 'Variant', draft: { kind: 'image', prompt: 'Tea', owner: 'owner' }, references: [] }]);
beforeEach(() => { jest.clearAllMocks(); mockNextId = 0; mockList.mockResolvedValue([]); mockSave.mockResolvedValue({ ok: true }); mockInfo.mockResolvedValue({ exists: true, isDirectory: false, size: 20 }); mockOwned.mockResolvedValue(new Map()); mockRead.mockResolvedValue('c2FtZSBieXRlcw=='); });
it('saves a separate private Flow with every reviewed item and no generation or payment call', async () => {
  const flow = await prepareReviewedBatch(batch(), () => true);
  expect(flow.id).toBe('newbatch0'); expect(flow.isPublic).toBe(false); expect(flow.data.nodes).toHaveLength(2);
  expect(mockSave).toHaveBeenCalledWith('owner', [expect.objectContaining({ id: 'newbatch0' })]);
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
  expect(mockUpload).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image', url: expect.stringMatching(/^file:\/\/\/cache\//), id: expect.stringMatching(/^batchref/) }), 'owner');
  expect(mockCopy).toHaveBeenCalledWith({ from: source.url, to: expect.stringMatching(/^file:\/\/\/cache\//) });
  expect(JSON.stringify(flow.data)).not.toContain('file:///');
  expect(flow.data.nodes!.find(node => node.type === 'imageInputNode')!.data.inputAssetId).toMatch(/^batchref/);
});
const referenced = (prompt = 'Tea', url = 'file:///private/editor.png') => makeReviewedBatch('film', 'project', 'Film', 'owner', [{ id: 'shot', label: 'Shot', draft: { kind: 'image', prompt, owner: 'owner', references: [{ url, label: 'Reference' }] }, references: [{ sourceId: 'media', url, label: 'Reference' }] }]);
it('changes the batch and owned asset identity when bytes change under the same editor media ID', async () => {
  const first = await prepareReviewedBatch(referenced(), () => true), firstId = mockUpload.mock.calls[0][0].id;
  mockList.mockResolvedValue([first]); mockRead.mockResolvedValue('cmVwbGFjZW1lbnQgYnl0ZXM=');
  const second = await prepareReviewedBatch(referenced(), () => true);
  expect(second.id).not.toBe(first.id); expect(mockUpload.mock.calls[1][0].id).not.toBe(firstId);
  expect(mockSave.mock.calls[1][1][0].id).toBe(second.id);
});
it('reopens the same content after its location changes and skips uploads for a prompt-only revision', async () => {
  const first = await prepareReviewedBatch(referenced(), () => true), assetId = mockUpload.mock.calls[0][0].id;
  mockList.mockResolvedValue([first]); mockUpload.mockClear(); mockSave.mockClear();
  expect(await prepareReviewedBatch(referenced('Tea', 'file:///private/renewed.png'), () => true)).toBe(first);
  expect(mockUpload).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled();
  mockOwned.mockResolvedValue(new Map([[assetId, { id: assetId, kind: 'image', url: 'fresh-owned-link' }]]));
  const second = await prepareReviewedBatch(referenced('Changed prompt'), () => true);
  expect(second.id).not.toBe(first.id); expect(mockUpload).not.toHaveBeenCalled();
  expect(second.data.nodes!.find(node => node.type === 'imageInputNode')!.data.inputAssetId).toBe(assetId);
});
