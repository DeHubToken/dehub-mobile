import React from 'react';
import renderer, { act } from 'react-test-renderer';
let mockWallet = 'owner';
const mockLoad = jest.fn();
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ walletAddress: mockWallet }) }));
jest.mock('../../services/creator-flow-assets', () => ({
  flowAssetId: (node: any) => node.data.audioAssetId || '', loadFlowAssets: (...args: unknown[]) => mockLoad(...args),
  assetNodePatch: (_node: unknown, asset: any) => ({ audioUrl: asset.url }),
}));
jest.mock('../../components/CreatorFlow/FlowNodeList', () => ({ __esModule: true, default: 'FlowNodeList' }));
import OwnedFlowMedia from '../../components/CreatorFlow/OwnedFlowMedia';
const nodes = [{ id: 'audio', type: 'audioInputNode', position: { x: 0, y: 0 }, data: { audioAssetId: 'owned', audioUrl: 'expired' } }];
beforeEach(() => { jest.clearAllMocks(); mockWallet = 'owner'; });
it('never displays a signed URL until renewed and invalidates it before expiry', async () => {
  jest.useFakeTimers(); let tree!: renderer.ReactTestRenderer;
  mockLoad.mockResolvedValue(new Map([['owned', { id: 'owned', kind: 'audio', url: 'fresh-private-url' }]]));
  try {
    await act(async () => { tree = renderer.create(<OwnedFlowMedia wallet="owner" nodes={nodes} edges={[]} />); });
    expect(tree.root.findByType('FlowNodeList' as any).props.nodes[0].data.audioUrl).toBeUndefined();
    await act(async () => { tree.root.findByType('Pressable' as any).props.onPress(); });
    expect(tree.root.findByType('FlowNodeList' as any).props.nodes[0].data.audioUrl).toBe('fresh-private-url');
    await act(async () => { jest.advanceTimersByTime(50 * 60 * 1000); });
    expect(tree.root.findByType('FlowNodeList' as any).props.nodes[0].data.audioUrl).toBeUndefined();
    expect(mockLoad).toHaveBeenCalledTimes(1);
  } finally { act(() => tree?.unmount()); jest.useRealTimers(); }
});
it('drops a pending private media response when the authenticated account changes', async () => {
  let release!: (value: Map<string, unknown>) => void, tree!: renderer.ReactTestRenderer;
  mockLoad.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  try {
    await act(async () => { tree = renderer.create(<OwnedFlowMedia wallet="owner" nodes={nodes} edges={[]} />); });
    act(() => tree.root.findByType('Pressable' as any).props.onPress());
    mockWallet = 'other'; act(() => tree.update(<OwnedFlowMedia wallet="owner" nodes={nodes} edges={[]} />));
    expect(tree.toJSON()).toBeNull();
    mockWallet = 'owner'; act(() => tree.update(<OwnedFlowMedia wallet="owner" nodes={nodes} edges={[]} />));
    await act(async () => { release(new Map([['owned', { id: 'owned', kind: 'audio', url: 'old-owner-private-url' }]])); });
    expect(tree.root.findByType('FlowNodeList' as any).props.nodes[0].data.audioUrl).toBeUndefined();
  } finally { act(() => tree?.unmount()); }
});
