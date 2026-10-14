import { patchTipBadges } from '../../libs/tip-badges';
describe('confirmed tip badge snapshots', () => {
  const account = { address: '0xabc', username: 'dehubfam', badgeBalance: 10000, badgeLock: { tier: 'Crab', requirement: 10000 } };
  it('updates nested feed and profile identities without changing unrelated accounts', () => {
    const unrelated = { address: '0xdef', badgeBalance: 500 };
    const value: any = { pages: [{ items: [{ minterUser: { address: '0xABC', badgeBalance: 0 } }, { user: { username: 'dehubfam', badgeBalance: 0 } }, unrelated] }] };
    const updated = patchTipBadges(value, [account]);
    expect(updated.pages[0].items[0].minterUser?.badgeBalance).toBe(10000);
    expect(updated.pages[0].items[1].user?.badgeBalance).toBe(10000);
    expect(updated.pages[0].items[2]).toBe(unrelated);
    expect(value.pages[0].items[0].minterUser?.badgeBalance).toBe(0);
  });
  it('preserves identity when no account changed and accepts zero balances', () => {
    const value = { address: '0xdef', badgeBalance: 500 };
    expect(patchTipBadges(value, [account])).toBe(value);
    expect(patchTipBadges(account, [{ ...account, badgeBalance: 0 }]).badgeBalance).toBe(0);
  });
});

