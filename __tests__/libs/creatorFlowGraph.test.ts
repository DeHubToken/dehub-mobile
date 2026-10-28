import { durableFlowNodes, graphOrder } from '../../libs/creatorFlowGraph';
it('orders typed audio nodes and refuses cycles or incompatible paid inputs', () => {
  const nodes = [{ id: 'text', type: 'promptNode', data: { prompt: 'A bell' } }, { id: 'audio', type: 'audioGenNode', data: { audioTask: 'sfx' } }, { id: 'transcript', type: 'audioGenNode', data: { audioTask: 'transcribe' } }];
  const edges = [{ id: 'a', source: 'text', target: 'audio', targetHandle: 'prompt' }, { id: 'b', source: 'audio', sourceHandle: 'audio', target: 'transcript', targetHandle: 'audio' }];
  expect(graphOrder(nodes, edges)).toEqual(['text','audio','transcript']);
  expect(() => graphOrder(nodes, [{ ...edges[0], targetHandle: 'audio' }])).toThrow('creatorFlow.invalidGraph');
  expect(() => graphOrder(nodes, [...edges, { ...edges[0], id: 'duplicate' }])).toThrow('creatorFlow.invalidGraph');
  const cycle = [{ id: 'one', type: 'audioGenNode', data: { audioTask: 'isolate' } }, { id: 'two', type: 'audioGenNode', data: { audioTask: 'isolate' } }];
  expect(() => graphOrder(cycle, [{ id: 'a', source: 'one', sourceHandle: 'audio', target: 'two', targetHandle: 'audio' }, { id: 'b', source: 'two', sourceHandle: 'audio', target: 'one', targetHandle: 'audio' }])).toThrow('creatorFlow.invalidGraph');
});
it('stores owned media ids without private URLs or audio history', () => {
  const [audio, image] = durableFlowNodes([{ id: 'a', type: 'audioGenNode', data: { audioAssetId: 'owned-audio', audioUrl: 'https://private.test/signed', generations: ['https://private.test/old'] } },
    { id: 'i', type: 'imageInputNode', data: { inputAssetId: 'owned-image', imageUrl: 'https://private.test/image' } }]);
  expect(audio.data).toEqual({ audioAssetId: 'owned-audio' }); expect(image.data).toEqual({ inputAssetId: 'owned-image' });
});
