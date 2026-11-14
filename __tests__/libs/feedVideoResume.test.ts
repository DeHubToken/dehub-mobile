import { clearFeedVideoPlaces, peekFeedVideoPlace, rememberFeedVideoPlace, usedFeedVideoPlace } from "../../libs/feedVideoResume";

describe("feed video place", () => {
  beforeEach(clearFeedVideoPlaces);

  it("keeps the place until a player has used it", () => {
    rememberFeedVideoPlace("a", 12.5, 1000);
    expect(peekFeedVideoPlace("a", 30_000)).toBe(12.5);
    expect(peekFeedVideoPlace("a", 30_001)).toBe(12.5);
    usedFeedVideoPlace("a");
    expect(peekFeedVideoPlace("a", 30_002)).toBe(0);
  });

  it("forgets after a minute", () => {
    rememberFeedVideoPlace("a", 12.5, 1000);
    expect(peekFeedVideoPlace("a", 62_000)).toBe(0);
  });

  it("a player that never started does not wipe the place", () => {
    rememberFeedVideoPlace("a", 8, 1000);
    rememberFeedVideoPlace("a", 0, 2000);
    expect(peekFeedVideoPlace("a", 3000)).toBe(8);
  });

  it("keeps only the latest few", () => {
    for (let i = 0; i < 20; i++) rememberFeedVideoPlace(`v${i}`, 5, 1000);
    expect(peekFeedVideoPlace("v0", 2000)).toBe(0);
    expect(peekFeedVideoPlace("v19", 2000)).toBe(5);
  });
});
