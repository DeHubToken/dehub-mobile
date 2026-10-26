const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: jest.fn(async (key: string) => mockStore.get(key) || null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('../../config/storefront', () => ({ DIGITAL_PURCHASES_ENABLED: true }));
jest.mock('../../services/ai.service', () => ({ generateImage: jest.fn(), startVideoGeneration: jest.fn(), pollVideoGeneration: jest.fn(), quoteAiJob: jest.fn() }));
jest.mock('../../services/creator.service', () => ({ saveCreatorAsset: jest.fn() }));
jest.mock('../../services/creator-flow-assets', () => ({ loadFlowAssets: jest.fn(async () => new Map()), flowAssetId: () => '', assetNodePatch: () => ({}) }));
import { generateImage, startVideoGeneration, pollVideoGeneration, quoteAiJob } from '../../services/ai.service';
import { saveCreatorAsset } from '../../services/creator.service';
import { planNativeFlow, readNativeFlowReceipt, restartNativeFlowRun, runNativeFlow, type NativeFlowGraph } from '../../services/creator-flow-runner';
const text = { id: 'text', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'A cup on a table' } };
const graph = (video = false): NativeFlowGraph => ({ id: 'flow12345', nodes: [text, { id: 'render', type: video ? 'videoGenNode' : 'imageGenNode', position: { x: 300, y: 0 }, data: {
  model: video ? 'kling-2.5-turbo' : 'gemini-3.1-flash-image', aspectRatio: video ? '16:9' : '1:1', duration: 5, resolution: '720p',
} }], edges: [{ id: 'wire', source: 'text', target: 'render', targetHandle: 'prompt' }] });
beforeEach(() => {
  jest.clearAllMocks(); mockStore.clear();
  (quoteAiJob as jest.Mock).mockResolvedValue({ priceDhb: 10, priceUsd: 0.01 });
  (generateImage as jest.Mock).mockResolvedValue({ success: true, imageUrl: 'https://media.test/image.png' });
  (saveCreatorAsset as jest.Mock).mockResolvedValue(undefined);
});
it('validates malformed graphs before pricing or submitting paid work', async () => {
  const bad = graph(); bad.edges.push({ id: 'cycle', source: 'render', target: 'text', targetHandle: 'prompt' });
  await expect(planNativeFlow(bad, 'owner')).rejects.toThrow();
  expect(quoteAiJob).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled();
});
it('records a stable job before submission and privately delivers its result', async () => {
  const plan = await planNativeFlow(graph(), 'owner');
  (generateImage as jest.Mock).mockImplementation(async () => {
    expect((await readNativeFlowReceipt('owner', plan.graph.id))?.nodes.render.jobId).toBe('00000000-0000-4000-8000-000000000001');
    return { success: true, imageUrl: 'https://media.test/image.png' };
  });
  const changed = jest.fn();
  await runNativeFlow(plan, 'owner', 'receipt', () => true, changed);
  expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ clientJobId: '00000000-0000-4000-8000-000000000001', txHash: 'receipt' }), 'owner');
  expect(saveCreatorAsset).toHaveBeenCalledWith(expect.objectContaining({ id: '00000000-0000-4000-8000-000000000001', kind: 'image' }), 'owner');
  expect((await readNativeFlowReceipt('owner', plan.graph.id))?.nodes.render.state).toBe('done');
  expect(await readNativeFlowReceipt('another-owner', plan.graph.id)).toBeNull();
  await expect(planNativeFlow(graph(), 'owner')).rejects.toThrow('creatorFlow.runAlreadyComplete');
  await restartNativeFlowRun('owner', plan.graph.id);
  expect(await readNativeFlowReceipt('owner', plan.graph.id)).toBeNull();
});
it('retains an interrupted provider ticket and resumes without submitting again', async () => {
  const input = graph(true), plan = await planNativeFlow(input, 'owner');
  (startVideoGeneration as jest.Mock).mockResolvedValue({ status: 'starting', predictionId: 'owned-ticket', provider: 'fal', falAppId: 'model' });
  (pollVideoGeneration as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
  await expect(runNativeFlow(plan, 'owner', 'receipt', () => true, jest.fn())).rejects.toThrow('Offline');
  await expect(restartNativeFlowRun('owner', input.id)).rejects.toThrow('creatorFlow.recoverBeforeEdit');
  const resumed = await planNativeFlow(input, 'owner'); expect(resumed.resume).toBe(true);
  (pollVideoGeneration as jest.Mock).mockResolvedValue({ status: 'succeeded', videoUrl: 'https://media.test/video.mp4', libraryId: 'owned-library-id' });
  await runNativeFlow(resumed, 'owner', 'ignored-new-receipt', () => true, jest.fn());
  expect(startVideoGeneration).toHaveBeenCalledTimes(1);
  expect(pollVideoGeneration).toHaveBeenLastCalledWith('owned-ticket', { provider: 'fal', falAppId: 'model', walletAddress: 'owner' });
});
it('saves an accepted ticket but starts no follow-up work after an account change', async () => {
  const plan = await planNativeFlow(graph(true), 'owner'); let current = true;
  (startVideoGeneration as jest.Mock).mockImplementation(async () => { current = false; return { status: 'starting', predictionId: 'owned-ticket', provider: 'fal', falAppId: 'model' }; });
  await expect(runNativeFlow(plan, 'owner', 'receipt', () => current, jest.fn())).rejects.toThrow('SIGN_IN_REQUIRED');
  expect((await readNativeFlowReceipt('owner', plan.graph.id))?.nodes.render.ticket?.predictionId).toBe('owned-ticket');
  expect(pollVideoGeneration).not.toHaveBeenCalled(); expect(saveCreatorAsset).not.toHaveBeenCalled();
});
