import { readFileSync } from "fs";
import { resolve } from "path";
import {
  __resetScrollActivityForTests,
  isFeedScrolling,
  setFeedScrolling,
  subscribeFeedSettled,
} from "../../libs/scrollActivity";

describe("feed scroll activity", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetScrollActivityForTests();
  });
  afterEach(() => jest.useRealTimers());

  it("notifies once on settle, not on begin", () => {
    const fn = jest.fn();
    subscribeFeedSettled(fn);
    setFeedScrolling(true);
    expect(isFeedScrolling()).toBe(true);
    expect(fn).not.toHaveBeenCalled();
    setFeedScrolling(false);
    setFeedScrolling(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isFeedScrolling()).toBe(false);
  });

  it("clears itself if no settle ever arrives", () => {
    const fn = jest.fn();
    subscribeFeedSettled(fn);
    setFeedScrolling(true);
    jest.advanceTimersByTime(2600);
    expect(isFeedScrolling()).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("icons defer their SVG tree while the feed flings", () => {
  const icon = readFileSync(resolve(__dirname, "../../components/ui/Icon.tsx"), "utf8");
  const feed = readFileSync(resolve(__dirname, "../../components/Home/InfiniteVideoFeed.tsx"), "utf8");

  it("renders a same-sized box until ready", () => {
    expect(icon).toMatch(/const ready = useReadyAfterScroll\(\);/);
    expect(icon).toMatch(/if \(!ready\) \{\s*const box = glass \? size \+ glassPadding \* 2 : size;\s*return <View style=\{\{ width: box, height: box \}\} \/>;/);
  });

  it("is armed by the feed's drag and momentum and released by settle", () => {
    expect((feed.match(/setFeedScrolling\(true\)/g) || []).length).toBe(2);
    expect(feed).toMatch(/scrollingRef\.current = false;\s*setFeedScrolling\(false\);/);
  });
});
