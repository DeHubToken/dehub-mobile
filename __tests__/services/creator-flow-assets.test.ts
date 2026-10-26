const mockInvoke = jest.fn();
jest.mock('../../services/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));
jest.mock('../../services/ai.service', () => ({ dehubAuthHeaders: async (wallet: string) => ({ 'x-dehub-token': 'session', 'x-wallet-address': wallet }) }));
import { assetNodePatch, loadFlowAssets } from '../../services/creator-flow-assets';
beforeEach(() => mockInvoke.mockReset());
it('renews private URLs from the owner library and clears expired values', async () => {
  mockInvoke.mockResolvedValue({ data: { jobs: [{ id: 'owned', kind: 'video', url: 'https://private.test/fresh' }], nextOffset: null }, error: null });
  const assets = await loadFlowAssets('owner', ['owned']);
  const patch = assetNodePatch({ id: 'input', type: 'videoInputNode', data: { videoUrl: 'https://private.test/expired', imageUrl: 'stale-image' } }, assets.get('owned')!);
  expect(patch.videoUrl).toBe('https://private.test/fresh'); expect(patch.imageUrl).toBeUndefined(); expect(patch.capturedFrameUrl).toBeUndefined();
  expect(mockInvoke).toHaveBeenCalledWith('creator-library', expect.objectContaining({ headers: expect.objectContaining({ 'x-wallet-address': 'owner' }) }));
});
it('refuses wrong-kind and missing media instead of keeping an old usable URL', async () => {
  const node = { id: 'input', type: 'videoInputNode', data: { videoUrl: 'expired' } };
  expect(() => assetNodePatch(node, { id: 'owned', kind: 'image', url: 'image' })).toThrow('creatorFlow.missingSavedMedia');
  expect(() => assetNodePatch(node, { id: 'owned', kind: 'video' })).toThrow('creatorFlow.missingSavedMedia');
  mockInvoke.mockResolvedValue({ data: { jobs: [], nextOffset: null }, error: null });
  expect((await loadFlowAssets('owner', ['deleted'])).has('deleted')).toBe(false);
});
it('keeps transcript-only outputs usable as text but never as audio inputs', () => {
  const transcript = { id: 'owned', kind: 'audio', transcript: 'A bell is ringing.' };
  expect(assetNodePatch({ id: 'text', type: 'audioGenNode', data: { audioTask: 'transcribe', audioUrl: 'expired' } }, transcript)).toMatchObject({ outputText: 'A bell is ringing.', audioUrl: undefined });
  expect(() => assetNodePatch({ id: 'audio', type: 'audioInputNode', data: {} }, transcript)).toThrow('creatorFlow.missingSavedMedia');
});
