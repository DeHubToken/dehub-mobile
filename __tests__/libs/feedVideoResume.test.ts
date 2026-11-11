import { clearFeedVideoPlaces, rememberFeedVideoPlace, takeFeedVideoPlace } from "../../libs/feedVideoResume";

describe("feed video place", () => {
  beforeEach(clearFeedVideoPlaces);

  it("gives the place back once, within a minute", () => {
    rememberFeedVideoPlace("a", 12.5, 1000);
    expect(takeFeedVideoPlace("a", 30_000)).toBe(12.5);
    expect(takeFeedVideoPlace("a", 30_001)).toBe(0);
  });

  it("forgets after a minute", () => {
    rememberFeedVideoPlace("a", 12.5, 1000);
    expect(takeFeedVideoPlace("a", 62_000)).toBe(0);
  });

  it("does not keep a video that had barely started", () => {
    rememberFeedVideoPlace("a", 8, 1000);
    rememberFeedVideoPlace("a", 0.4, 2000);
    expect(takeFeedVideoPlace("a", 3000)).toBe(0);
  });

  it("keeps only the latest few", () => {
    for (let i = 0; i < 20; i++) rememberFeedVideoPlace(`v${i}`, 5, 1000);
    expect(takeFeedVideoPlace("v0", 2000)).toBe(0);
    expect(takeFeedVideoPlace("v19", 2000)).toBe(5);
  });
});
