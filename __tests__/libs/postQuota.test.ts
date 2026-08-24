import { capFeedByAuthorAllowance, getPostAllowanceForBadge } from "../../libs/postQuota";

// Cases mirror web's src/lib/__tests__/post-quota.test.ts one-for-one. If these
// two files ever disagree, the app and the site are composing different feeds.
describe("getPostAllowanceForBadge", () => {
  it("gives one feed slot a day with no badge", () => {
    expect(getPostAllowanceForBadge(undefined).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(null).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(0).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge("not-a-number").postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(9999).postsPerDay).toBe(1);
    expect(getPostAllowanceForBadge(undefined).isBaseline).toBe(true);
  });

  it("adds one slot per badge tier", () => {
    expect(getPostAllowanceForBadge(10_000).postsPerDay).toBe(2); // Crab
    expect(getPostAllowanceForBadge(25_000).postsPerDay).toBe(3); // Lobster
    expect(getPostAllowanceForBadge(50_000_000).postsPerDay).toBe(14); // Meglodon
    expect(getPostAllowanceForBadge(50_000_000).isBaseline).toBe(false);
  });

  it("honours username overrides", () => {
    expect(getPostAllowanceForBadge(undefined, "maldoteth").postsPerDay).toBe(14);
    expect(getPostAllowanceForBadge(undefined, "@mal").tierName).toBe("Meglodon");
  });
});

describe("capFeedByAuthorAllowance", () => {
  const post = (minter: string, badgeBalance: number, createdAt: string, id: number) => ({
    tokenId: id,
    minter,
    minterUser: { address: minter, username: `u${minter}`, badgeBalance },
    createdAt,
  });

  it("keeps only the allowance for a low-tier author", () => {
    // 10,587 DHB is a Crab, which is two feed slots a day. This is the shape of
    // the live feed that prompted the fix: one author held 14 of the first 30.
    const items = Array.from({ length: 14 }, (_, i) =>
      post("0xaaa", 10_587, `2026-08-23T0${i % 10}:00:00.000Z`, i),
    );
    expect(capFeedByAuthorAllowance(items)).toHaveLength(2);
  });

  it("keeps the earliest rows in the list, not a random two", () => {
    const items = [
      post("0xaaa", 10_587, "2026-08-23T05:00:00.000Z", 1),
      post("0xaaa", 10_587, "2026-08-23T04:00:00.000Z", 2),
      post("0xaaa", 10_587, "2026-08-23T03:00:00.000Z", 3),
    ];
    expect(capFeedByAuthorAllowance(items).map((i) => i.tokenId)).toEqual([1, 2]);
  });

  it("gives each author their own allowance", () => {
    const items = [
      post("0xaaa", 0, "2026-08-23T01:00:00.000Z", 1),
      post("0xaaa", 0, "2026-08-23T02:00:00.000Z", 2),
      post("0xbbb", 0, "2026-08-23T03:00:00.000Z", 3),
      post("0xbbb", 0, "2026-08-23T04:00:00.000Z", 4),
    ];
    expect(capFeedByAuthorAllowance(items).map((i) => i.tokenId)).toEqual([1, 3]);
  });

  it("buckets by UTC day so yesterday's slots are not spent on today", () => {
    const items = [
      post("0xaaa", 0, "2026-08-23T23:00:00.000Z", 1),
      post("0xaaa", 0, "2026-08-23T22:00:00.000Z", 2),
      post("0xaaa", 0, "2026-08-22T10:00:00.000Z", 3),
    ];
    expect(capFeedByAuthorAllowance(items).map((i) => i.tokenId)).toEqual([1, 3]);
  });

  it("scales the allowance with the author's badge", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      post("0xaaa", 50_000, `2026-08-23T0${i}:00:00.000Z`, i), // Piranha -> 4 slots
    );
    expect(capFeedByAuthorAllowance(items)).toHaveLength(4);
  });

  it("lets rows with no identifiable author through untouched", () => {
    const items = [
      { tokenId: 1, createdAt: "2026-08-23T01:00:00.000Z" },
      { tokenId: 2, createdAt: "2026-08-23T02:00:00.000Z" },
      { tokenId: 3, createdAt: "2026-08-23T03:00:00.000Z" },
    ];
    expect(capFeedByAuthorAllowance(items)).toHaveLength(3);
  });

  it("reads the text-post author shape as well as the NFT one", () => {
    const items = [
      { id: "a", author: { id: "0xccc", handle: "c", badgeBalance: 0 }, createdAt: "2026-08-23T01:00:00.000Z" },
      { id: "b", author: { id: "0xccc", handle: "c", badgeBalance: 0 }, createdAt: "2026-08-23T02:00:00.000Z" },
    ];
    expect(capFeedByAuthorAllowance(items)).toHaveLength(1);
  });

  it("does not let an undated row swallow another day's slot", () => {
    const items = [
      post("0xaaa", 0, "2026-08-23T01:00:00.000Z", 1),
      { tokenId: 2, minter: "0xaaa", minterUser: { address: "0xaaa", badgeBalance: 0 } },
    ];
    // Different buckets (a real day and "unknown"), so both survive.
    expect(capFeedByAuthorAllowance(items as any)).toHaveLength(2);
  });
});
