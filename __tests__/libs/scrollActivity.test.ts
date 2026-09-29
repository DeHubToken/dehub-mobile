import { readFileSync } from "fs";
import { resolve } from "path";
import {
  __resetScrollActivityForTests,
  isFeedScrolling,
  setFeedScrolling,
  subscribeFeedScrollStart,
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

  it("notifies start once per rest-to-moving transition", () => {
    const fn = jest.fn();
    subscribeFeedScrollStart(fn);
    setFeedScrolling(true);
    setFeedScrolling(true);
    expect(fn).toHaveBeenCalledTimes(1);
    setFeedScrolling(false);
    setFeedScrolling(true);
    expect(fn).toHaveBeenCalledTimes(2);
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

describe("feed rows never wait for the scroll to settle", () => {
  const icon = readFileSync(resolve(__dirname, "../../components/ui/Icon.tsx"), "utf8");
  const card = readFileSync(resolve(__dirname, "../../components/Home/FeedCard.tsx"), "utf8");
  const header = readFileSync(resolve(__dirname, "../../components/Home/FeedCardHeader.tsx"), "utf8");
  const feed = readFileSync(resolve(__dirname, "../../components/Home/InfiniteVideoFeed.tsx"), "utf8");

  it("draws icons, the action row and header buttons at once", () => {
    expect(icon).not.toMatch(/useReadyAfterScroll|scrollActivity/);
    expect(card).not.toMatch(/DeferredBlock/);
    expect(header).not.toMatch(/DeferredBlock/);
  });

  it("is armed by the feed's drag and momentum and released by settle", () => {
    expect((feed.match(/setFeedScrolling\(true\)/g) || []).length).toBe(2);
    expect(feed).toMatch(/scrollingRef\.current = false;\s*setFeedScrolling\(false\);/);
  });
});
