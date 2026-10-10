import { acquireStreamViewer } from '../../libs/stream-presence';

it('shares one viewer between a feed preview and the full player', () => {
  const emit = jest.fn();
  const preview = acquireStreamViewer(emit, () => true, 1, 'live');
  const post = acquireStreamViewer(emit, () => true, 1, 'live');
  expect(emit.mock.calls).toEqual([['stream.join', { streamId: 'live' }]]);
  preview();
  expect(emit).toHaveBeenCalledTimes(1);
  post(); post();
  expect(emit.mock.calls[1]).toEqual(['stream.left', { streamId: 'live' }]);
  expect(emit).toHaveBeenCalledTimes(2);
});

it('rejoins after reconnect without letting the old player leave the new connection', () => {
  const emit = jest.fn();
  const old = acquireStreamViewer(emit, () => true, 1, 'live');
  const current = acquireStreamViewer(emit, () => true, 2, 'live');
  old();
  expect(emit.mock.calls.map(call => call[0])).toEqual(['stream.join', 'stream.join']);
  current();
  expect(emit.mock.calls[2][0]).toBe('stream.left');
});

it('does not queue a leave while disconnected', () => {
  const emit = jest.fn();
  const leave = acquireStreamViewer(emit, () => false, 1, 'live');
  leave();
  expect(emit).toHaveBeenCalledTimes(1);
});
