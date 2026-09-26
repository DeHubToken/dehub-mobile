const mockStore = new Map<string, boolean>();
jest.mock('../../libs/storage', () => ({
  storage: {
    getBoolean: (k: string) => mockStore.get(k),
    set: (k: string, v: boolean) => { mockStore.set(k, v); },
    delete: (k: string) => { mockStore.delete(k); },
  },
}));

import { claimMinimalLaunch, settleMinimalLaunch } from '../../libs/minimalBootGuard';

describe('minimal launch guard', () => {
  beforeEach(() => mockStore.clear());

  it('lets a launch start in minimal and stays clear once the app is on screen', () => {
    expect(claimMinimalLaunch()).toBe(true);
    settleMinimalLaunch();
    expect(claimMinimalLaunch()).toBe(true);
  });

  it('falls back after a minimal launch that never came up, then lets the next one try again', () => {
    expect(claimMinimalLaunch()).toBe(true);
    // no settle: the app never got past the preloader
    expect(claimMinimalLaunch()).toBe(false);
    expect(claimMinimalLaunch()).toBe(true);
  });
});
