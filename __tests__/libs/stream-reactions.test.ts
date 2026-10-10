jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ debug: jest.fn() }) }));
import { WebSocketClient } from '../../services/ws/socket-client';

it('delivers another device on the same account and marks only this socket as the echo', () => {
  const client: any = Object.create(WebSocketClient.prototype);
  client.socket = { id: 'apk' };
  const receive = jest.fn();
  client.listeners = new Map([['stream.reaction', new Set([receive])]]);
  for (const sourceSocketId of ['chrome', 'apk']) {
    client.emitInternal('stream.reaction', { sourceSocketId, reactionType: 'LIKE', user: { address: 'same-wallet' } });
  }
  expect(receive.mock.calls.map(([event]) => event.isOwnReaction)).toEqual([false, true]);
});
