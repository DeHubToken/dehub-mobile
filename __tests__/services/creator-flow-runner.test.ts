const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: jest.fn(async (key: string) => mockStore.get(key) || null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
} }));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));
jest.mock('../../config/storefront', () => ({ DIGITAL_PURCHASES_ENABLED: true }));
jest.mock('../../services/ai.service', () => ({ generateImage: jest.fn(), startVideoGeneration: jest.fn(), pollVideoGeneration: jest.fn(), quoteAiJob: jest.fn() }));
jest.mock('../../services/creator.service', () => ({ saveCreatorAsset: jest.fn() }));
jest.mock('../../services/creator-audio.service', () => ({ runCreatorAudio: jest.fn() }));
jest.mock('../../services/creator-flow-download', () => ({ downloadFlowAudio: jest.fn() }));
jest.mock('../../services/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../../services/creator-flow-assets', () => ({ loadFlowAssets: jest.fn(async () => new Map()), flowAssetId: (node: any) => String(node.data.audioAssetId || node.data.inputAssetId || node.data.outputAssetId || ''),
  assetNodePatch: (_node: any, asset: any) => asset.transcript ? { outputText: asset.transcript } : asset.kind === 'audio' ? { audioUrl: asset.url } : asset.kind === 'image' ? { imageUrl: asset.url } : { videoUrl: asset.url } }));
import { generateImage, startVideoGeneration, pollVideoGeneration, quoteAiJob } from '../../services/ai.service';
import { saveCreatorAsset } from '../../services/creator.service';
import { runCreatorAudio } from '../../services/creator-audio.service';
import { downloadFlowAudio } from '../../services/creator-flow-download';
import { loadFlowAssets } from '../../services/creator-flow-assets';
import { admitNativeFlowRun, planNativeFlow, readNativeFlowReceipt, restartNativeFlowRun, runNativeFlow, type NativeFlowGraph } from '../../services/creator-flow-runner';
const text = { id: 'text', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'A cup on a table' } };
const graph = (video = false): NativeFlowGraph => ({ id: 'flow12345', nodes: [text, { id: 'render', type: video ? 'videoGenNode' : 'imageGenNode', position: { x: 300, y: 0 }, data: {
  model: video ? 'kling-2.5-turbo' : 'gemini-3.1-flash-image', aspectRatio: video ? '16:9' : '1:1', duration: 5, resolution: '720p',
} }], edges: [{ id: 'wire', source: 'text', target: 'render', targetHandle: 'prompt' }] });
beforeEach(() => {
  jest.clearAllMocks(); mockStore.clear(); mockUuid = 0;
  (loadFlowAssets as jest.Mock).mockResolvedValue(new Map());
  (quoteAiJob as jest.Mock).mockResolvedValue({ priceDhb: 10, priceUsd: 0.01 });
  (generateImage as jest.Mock).mockResolvedValue({ success: true, imageUrl: 'https://media.test/image.png' });
  (saveCreatorAsset as jest.Mock).mockResolvedValue(undefined);
});
it('retains a returned payment after close and resumes without another payment', async () => {
  const input = graph(), plan = await planNativeFlow(input, 'owner'); let current = true;
  const pay = jest.fn(async () => { current = false; return 'paid-before-close'; });
  expect(await admitNativeFlowRun(plan, input, 'owner', { isCurrent: () => current, saveDraft: jest.fn(), pay, onNode: jest.fn() })).toBe(false);
  expect((await readNativeFlowReceipt('owner', input.id))?.txHash).toBe('paid-before-close');
  expect(generateImage).not.toHaveBeenCalled();
  await expect(restartNativeFlowRun('owner', input.id)).rejects.toThrow('creatorFlow.recoverBeforeEdit');
  current = true;
  const resumed = await planNativeFlow(input, 'owner'), secondPay = jest.fn();
  await admitNativeFlowRun(resumed, input, 'owner', { isCurrent: () => current, saveDraft: jest.fn(), pay: secondPay, onNode: jest.fn() });
  expect(secondPay).not.toHaveBeenCalled(); expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ txHash: 'paid-before-close' }), 'owner');
});
it('requires another explicit review when the fresh price changes', async () => {
  const input = graph(), plan = await planNativeFlow(input, 'owner');
  (quoteAiJob as jest.Mock).mockResolvedValue({ priceDhb: 11, priceUsd: 0.011 });
  const pay = jest.fn(), saveDraft = jest.fn(), onPriceChanged = jest.fn();
  await expect(admitNativeFlowRun(plan, input, 'owner', { isCurrent: () => true, saveDraft, pay, onNode: jest.fn(), onPriceChanged })).rejects.toThrow('creatorFlow.planChanged');
  expect(pay).not.toHaveBeenCalled(); expect(saveDraft).not.toHaveBeenCalled(); expect(onPriceChanged).toHaveBeenCalledWith(expect.objectContaining({ priceDhb: 11 }));
});
it('does not pay after the account changes during draft persistence', async () => {
  const input = graph(), plan = await planNativeFlow(input, 'owner'); let current = true;
  const pay = jest.fn();
  expect(await admitNativeFlowRun(plan, input, 'owner', { isCurrent: () => current, saveDraft: async () => { current = false; }, pay, onNode: jest.fn() })).toBe(false);
  expect(pay).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled();
});
it('runs transcript-only output into a paid prompt and resumes without repeating free tasks', async () => {
  const input: NativeFlowGraph = { id: 'audioflow', nodes: [text,
    { id: 'sound', type: 'audioGenNode', position: { x: 0, y: 0 }, data: { audioTask: 'sfx' } },
    { id: 'transcript', type: 'audioGenNode', position: { x: 0, y: 0 }, data: { audioTask: 'transcribe' } },
    graph().nodes[1]], edges: [{ id: 'a', source: 'text', target: 'sound', targetHandle: 'prompt' },
      { id: 'b', source: 'sound', sourceHandle: 'audio', target: 'transcript', targetHandle: 'audio' },
      { id: 'c', source: 'transcript', sourceHandle: 'prompt', target: 'render', targetHandle: 'prompt' }] };
  const one = '00000000-0000-4000-8000-000000000001', two = '00000000-0000-4000-8000-000000000002';
  (loadFlowAssets as jest.Mock).mockImplementation(async (_wallet, ids: string[]) => new Map(ids.filter(id => id === one || id === two).map(id => [id, id === one ? { id, kind: 'audio', url: 'https://private.test/fresh.wav' } : { id, kind: 'audio', transcript: 'A bell rings.' }])));
  (runCreatorAudio as jest.Mock).mockResolvedValueOnce({ audioUrl: 'file://sound.wav' }).mockResolvedValueOnce({ transcript: 'A bell rings.' });
  (downloadFlowAudio as jest.Mock).mockResolvedValue({ uri: 'file://source.wav', name: 'source.wav', mimeType: 'audio/wav', size: 2, cleanup: jest.fn() });
  const plan = await planNativeFlow(input, 'owner');
  (generateImage as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
  await expect(runNativeFlow(plan, 'owner', 'receipt', () => true, jest.fn())).rejects.toThrow('Offline');
  const resumed = await planNativeFlow(input, 'owner');
  await runNativeFlow(resumed, 'owner', 'receipt', () => true, jest.fn());
  expect(runCreatorAudio).toHaveBeenCalledTimes(2);
  expect(runCreatorAudio).toHaveBeenLastCalledWith('', expect.objectContaining({ task: 'transcribe', media: expect.objectContaining({ name: 'source.wav', mimeType: 'audio/wav' }) }), 'owner');
  expect(generateImage).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: 'A bell rings.' }), 'owner');
});
it('never automatically repeats a free submission whose response was lost', async () => {
  const input: NativeFlowGraph = { id: 'freeflow', nodes: [text, { id: 'sound', type: 'audioGenNode', position: { x: 0, y: 0 }, data: { audioTask: 'sfx' } }], edges: [{ id: 'wire', source: 'text', target: 'sound', targetHandle: 'prompt' }] };
  (runCreatorAudio as jest.Mock).mockRejectedValueOnce(new Error('Response interrupted'));
  const plan = await planNativeFlow(input, 'owner');
  expect(plan.priceDhb).toBe(0);
  await expect(runNativeFlow(plan, 'owner', 'free', () => true, jest.fn())).rejects.toThrow('Response interrupted');
  const resumed = await planNativeFlow(input, 'owner');
  await expect(runNativeFlow(resumed, 'owner', 'free', () => true, jest.fn())).rejects.toThrow('creatorFlow.freeResultUnknown');
  expect(runCreatorAudio).toHaveBeenCalledTimes(1);
});
it('validates malformed graphs before pricing or submitting paid work', async () => {
  const bad = graph(); bad.edges.push({ id: 'cycle', source: 'render', target: 'text', targetHandle: 'prompt' });
  await expect(planNativeFlow(bad, 'owner')).rejects.toThrow();
  expect(quoteAiJob).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled();
});
it('preserves unknown imported node settings while refusing to price or execute them', async () => {
  const input = graph(); input.nodes.push({ id: 'future', type: 'futureToolNode', position: { x: 90, y: 80 }, data: { customPreset: { keep: true }, vendorOption: 'unchanged' } });
  const before = JSON.stringify(input);
  await expect(planNativeFlow(input, 'owner')).rejects.toThrow();
  expect(JSON.stringify(input)).toBe(before); expect(quoteAiJob).not.toHaveBeenCalled(); expect(generateImage).not.toHaveBeenCalled();
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
