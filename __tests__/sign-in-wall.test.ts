import { isSignInWall, noteSignInWall, onSignInWall, resetSignInWallForTests } from '../libs/sign-in-wall';

describe('sign-in wall', () => {
  afterEach(() => resetSignInWallForTests());

  it('spots the walled feed page and nothing else', () => {
    expect(isSignInWall({ result: [], signInRequired: true })).toBe(true);
    expect(isSignInWall({ result: [], pagination: { hasMore: false } })).toBe(false);
    expect(isSignInWall(undefined)).toBe(false);
  });

  it('asks for sign-in once a minute at most', () => {
    const seen = jest.fn();
    const off = onSignInWall(seen);
    noteSignInWall({ result: [] });
    noteSignInWall({ result: [], signInRequired: true });
    noteSignInWall({ result: [], signInRequired: true });
    off();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
