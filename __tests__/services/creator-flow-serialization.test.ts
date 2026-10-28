const mockInvoke = jest.fn().mockResolvedValue({ data: { ok: true }, error: null });
jest.mock('../../services/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));
jest.mock('../../services/ai.service', () => ({ dehubAuthHeaders: async () => ({ 'x-dehub-token': 'session' }) }));
import { saveFlows } from '../../services/creator-flows.service';
it('keeps preset and future-node settings while omitting private signed URLs from a saved graph', async () => {
  const future = { id: 'future', type: 'futureToolNode', position: { x: 99, y: 88 }, data: { vendor: { retained: true } } };
  await saveFlows('owner', [{ id: 'flow12345', name: 'Preset', isPublic: false, data: { nodes: [future, { id: 'video', type: 'videoGenNode', position: { x: 20, y: 30 }, data: {
    model: 'pixverse-effects', effect: 'example', seed: 17, negativePrompt: 'blur', presetId: 'preset', outputAssetId: 'owned', videoUrl: 'private-expired', capturedFrameUrl: 'private-frame', generations: ['private-history'],
  } }], edges: [] } }]);
  const body = (mockInvoke.mock.calls[0] as unknown as [string, { body: any }])[1].body;
  expect(body.flows[0].data.nodes[0]).toEqual(future);
  expect(body.flows[0].data.nodes[1].data).toEqual({ model: 'pixverse-effects', effect: 'example', seed: 17, negativePrompt: 'blur', presetId: 'preset', outputAssetId: 'owned' });
});
