import { orderNotificationTabKeys } from '../../libs/notification-tab-order';

describe('orderNotificationTabKeys', () => {
  const tabs = ['all', 'likes', 'comments', 'livestreams'] as const;

  it('keeps All first and ranks the other tabs by activity', () => {
    expect(orderNotificationTabKeys(tabs, {
      all: 12,
      likes: 2,
      comments: 3,
      livestreams: 7,
    }, 'all')).toEqual(['all', 'livestreams', 'comments', 'likes']);
  });

  it('keeps the original order when activity is tied', () => {
    expect(orderNotificationTabKeys(tabs, {
      all: 0,
      likes: 2,
      comments: 2,
      livestreams: 0,
    }, 'all')).toEqual(['all', 'likes', 'comments', 'livestreams']);
  });
});
