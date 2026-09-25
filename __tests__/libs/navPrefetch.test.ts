import {
  peekPostDetailSeed,
  seedPostDetail,
  takeWarmRequest,
  warmRequest,
} from "../../libs/navPrefetch";

describe("navPrefetch", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("hands the detail screen the seeded post", () => {
    seedPostDetail(42, { tokenId: 42, name: "post" });
    expect(peekPostDetailSeed("42")).toEqual({ tokenId: 42, name: "post" });
    expect(peekPostDetailSeed(undefined)).toBeNull();
  });

  it("keeps only the most recent seeds", () => {
    for (let i = 0; i < 25; i++) seedPostDetail(`evict-${i}`, i);
    expect(peekPostDetailSeed("evict-0")).toBeNull();
    expect(peekPostDetailSeed("evict-24")).toBe(24);
  });

  it("joins a warmed request once, then fetches afresh", async () => {
    const warmFetch = jest.fn().mockResolvedValue("warm");
    warmRequest("k1", warmFetch);
    warmRequest("k1", warmFetch);
    expect(warmFetch).toHaveBeenCalledTimes(1);

    const fresh = jest.fn().mockResolvedValue("fresh");
    await expect(takeWarmRequest("k1", fresh)).resolves.toBe("warm");
    await expect(takeWarmRequest("k1", fresh)).resolves.toBe("fresh");
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a warmed request that has gone stale", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    warmRequest("k2", () => Promise.resolve("old"));
    jest.setSystemTime(1_000_000 + 10_000);
    await expect(takeWarmRequest("k2", () => Promise.resolve("new"))).resolves.toBe("new");
  });

  it("falls back to a fresh fetch when the warmed one failed", async () => {
    warmRequest("k3", () => Promise.reject(new Error("offline")));
    await expect(takeWarmRequest("k3", () => Promise.resolve("retry"))).resolves.toBe("retry");
  });
});
