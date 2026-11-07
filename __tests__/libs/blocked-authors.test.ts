import { queryClient } from '../../config/queryClient';
import {
  clearBlockedAuthors,
  isAuthorBlocked,
  seedBlockedAuthors,
  setAuthorBlocked,
} from '../../libs/blocked-authors';

const BLOCKED = '0xAbC0000000000000000000000000000000000001';
const OTHER = '0xdef0000000000000000000000000000000000002';

describe('libs/blocked-authors', () => {
  afterEach(() => {
    clearBlockedAuthors();
    queryClient.clear();
  });

  it('tracks blocks by address, whatever the case, and unblocks', () => {
    setAuthorBlocked(BLOCKED, true);
    expect(isAuthorBlocked(BLOCKED.toLowerCase())).toBe(true);
    expect(isAuthorBlocked(OTHER)).toBe(false);
    setAuthorBlocked(BLOCKED, false);
    expect(isAuthorBlocked(BLOCKED)).toBe(false);
  });

  it('seeds from the server list without dropping a block made this session', () => {
    setAuthorBlocked(OTHER, true);
    seedBlockedAuthors([BLOCKED, null, undefined]);
    expect(isAuthorBlocked(BLOCKED)).toBe(true);
    expect(isAuthorBlocked(OTHER)).toBe(true);
  });

  it("prunes the author's posts from cached feeds and keeps their timestamps", () => {
    const feedKey = ['feed', 'home'];
    queryClient.setQueryData(
      feedKey,
      {
        pages: [{ result: [{ tokenId: 1, minter: BLOCKED }, { tokenId: 2, minter: OTHER }] }, { result: [{ tokenId: 3, minterUser: { address: BLOCKED } }] }],
        pageParams: [0, 1],
      },
      { updatedAt: 1234 },
    );
    const untouched = [{ tokenId: 4, minter: OTHER }];
    queryClient.setQueryData(['list'], untouched);

    setAuthorBlocked(BLOCKED, true);

    const feed = queryClient.getQueryData<any>(feedKey);
    expect(feed.pages.map((p: any) => p.result.map((r: any) => r.tokenId))).toEqual([[2], []]);
    expect(feed.pageParams).toEqual([0, 1]);
    expect(queryClient.getQueryState(feedKey)?.dataUpdatedAt).toBe(1234);
    expect(queryClient.getQueryData(['list'])).toBe(untouched);
  });
});
