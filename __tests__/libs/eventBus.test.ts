import { feedEvents } from '../../libs/eventBus';

describe('feedEvents', () => {
  it('passes a quiet request through to listeners', () => {
    const listener = jest.fn();
    const unsubscribe = feedEvents.onRefreshRequested(listener);
    feedEvents.requestRefresh({ quiet: true });
    feedEvents.requestRefresh();
    unsubscribe();
    feedEvents.requestRefresh();
    expect(listener.mock.calls).toEqual([[{ quiet: true }], [{}]]);
  });
});
